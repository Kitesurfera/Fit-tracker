import requests
from fastapi import FastAPI, APIRouter, HTTPException, Depends, Header, Request, BackgroundTasks
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.responses import Response
from starlette.concurrency import run_in_threadpool
from fastapi.middleware.cors import CORSMiddleware
from dotenv import load_dotenv
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import bcrypt
import jwt
import uuid
from pathlib import Path
from pydantic import BaseModel
from typing import List, Optional, Dict, Any
from datetime import datetime, timezone, timedelta
import asyncio
import time
import json
import re
import hashlib
import html
from google import genai as google_genai
from google.genai import types as genai_types
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
import mimetypes
mimetypes.init()
mimetypes.add_type('video/mp4', '.mp4')

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

mongo_url = os.environ['MONGO_URL']
DB_NAME = os.environ['DB_NAME']

# ¿Estamos en Vercel? (Vercel define esta variable). Algunas cosas cambian en servidores "serverless".
ON_VERCEL = bool(os.environ.get('VERCEL'))

class LoopSafeDatabase:
    """Acceso a MongoDB que funciona aunque cambie el "bucle de eventos" entre peticiones (puede pasar en Vercel).
    Crea un cliente por bucle y lo reutiliza; en un servidor normal (Render) solo hay uno."""
    def __init__(self, url: str, name: str):
        self._url, self._name, self._clients = url, name, {}

    def _database(self):
        try:
            loop = asyncio.get_running_loop()
        except RuntimeError:
            loop = None
        entry = self._clients.get(id(loop))
        if entry is None or entry[0] is not loop:
            for key, (old_loop, old_client) in list(self._clients.items()):
                if old_loop is not None and old_loop.is_closed():
                    old_client.close()
                    self._clients.pop(key, None)
            new_client = AsyncIOMotorClient(self._url, io_loop=loop) if loop else AsyncIOMotorClient(self._url)
            entry = (loop, new_client)
            self._clients[id(loop)] = entry
        return entry[1][self._name]

    def __getattr__(self, collection):
        return getattr(self._database(), collection)

    def __getitem__(self, collection):
        return self._database()[collection]

db = LoopSafeDatabase(mongo_url, DB_NAME)

# --- CONFIGURACIÓN GEMINI IA ---
# Usamos la librería oficial actual de Google (google-genai). La antigua (google-generativeai) ya no tiene soporte.
GEMINI_API_KEY = os.environ.get('GEMINI_API_KEY')
_gemini_clients: Dict[int, Any] = {}

def get_gemini_client():
    """Cliente de Gemini (uno por bucle de eventos, por el mismo motivo que la base de datos)."""
    if not GEMINI_API_KEY:
        return None
    loop = asyncio.get_running_loop()
    entry = _gemini_clients.get(id(loop))
    if entry is None or entry[0] is not loop:
        for key, (old_loop, _) in list(_gemini_clients.items()):
            if old_loop.is_closed():
                _gemini_clients.pop(key, None)
        entry = (loop, google_genai.Client(api_key=GEMINI_API_KEY))
        _gemini_clients[id(loop)] = entry
    return entry[1]
if not GEMINI_API_KEY:
    logger.warning("No se ha encontrado GEMINI_API_KEY en el entorno. El chat de IA no funcionará.")

# Modelos que se prueban en orden. Si uno falla por lo que sea (retirado, saturado, cuota, tarda demasiado...), se pasa al siguiente.
# Primero los "Flash", que responden en segundos; el "Pro" piensa mucho más y puede tardar minutos.
# Se pueden cambiar sin tocar el código con la variable de entorno GEMINI_MODELS (separados por comas).
GEMINI_MODELS = [m.strip() for m in os.environ.get('GEMINI_MODELS', 'gemini-flash-latest,gemini-2.5-flash,gemini-3.1-pro-preview').split(',') if m.strip()]
# Límites de tiempo: cada modelo tiene un máximo y la petición entera también (para no dejar a nadie esperando sin respuesta)
GEMINI_TIMEOUT_SECONDS = float(os.environ.get('GEMINI_TIMEOUT_SECONDS', 45))
GEMINI_TOTAL_BUDGET_SECONDS = float(os.environ.get('GEMINI_TOTAL_BUDGET_SECONDS', 100))
GEMINI_COOLDOWN_UNTIL: Dict[str, float] = {}   # modelo -> momento en que se puede volver a probar (tras agotar cuota o tardar demasiado)
_gemini_discovered: List[str] = []

JWT_SECRET = os.environ.get('JWT_SECRET')
JWT_ALGORITHM = 'HS256'
JWT_EXPIRATION_DAYS = int(os.environ.get('JWT_EXPIRATION_DAYS', 30))
if not JWT_SECRET:
    logger.error("¡ERROR CRÍTICO: No se ha encontrado JWT_SECRET!")

GOOGLE_CLIENT_ID = os.environ.get('GOOGLE_CLIENT_ID', '351214985492-nn6efvp8hi5vnqrnk65g6qs1j0qma28e.apps.googleusercontent.com')
GOOGLE_ANDROID_CLIENT_ID = os.environ.get('GOOGLE_ANDROID_CLIENT_ID', '351214985492-ahg14f57mak2mcj47q6jucsvcieu4dq9.apps.googleusercontent.com')
GOOGLE_IOS_CLIENT_ID = os.environ.get('GOOGLE_IOS_CLIENT_ID', '351214985492-r7k26kmllj5j7nef3bpdcv8vg5c4robk.apps.googleusercontent.com')
# Cliente web propio (botón oficial de Google en la web). Se acepta además de los anteriores.
GOOGLE_WEB_CLIENT_ID = os.environ.get('GOOGLE_WEB_CLIENT_ID', '510108017704-t0p5iojgsmuvqu6ekbh5rvejm6muslka.apps.googleusercontent.com')
GOOGLE_ALLOWED_AUDIENCES = {GOOGLE_CLIENT_ID, GOOGLE_WEB_CLIENT_ID, GOOGLE_ANDROID_CLIENT_ID, GOOGLE_IOS_CLIENT_ID}

security = HTTPBearer()
app = FastAPI()

# Los vídeos se guardan en Cloudinary: el servidor ya no guarda archivos en su disco
# (en Vercel tampoco se podría).

@app.get("/ping")
async def ping():
    return {"status": "awake", "message": "El servidor está activo."}

api_router = APIRouter(prefix="/api")

# --- MODELOS PYDANTIC ---
class AnalyticsAnalyzeRequest(BaseModel):
    athlete_name: str
    fatigue_data: list = []
    soreness_data: list = []
    recent_workouts_count: int = 0
    recent_prs: list = []
    # Informe por periodo (opcionales: las versiones antiguas de la app no los mandan)
    period_days: Optional[int] = None
    current_phase: Optional[str] = None
    summary: Optional[dict] = None

class WellnessCreate(BaseModel):
    fatigue: int
    stress: int
    sleep_quality: int
    soreness: int
    notes: Optional[str] = ""
    cycle_phase: Optional[str] = None
    date: Optional[str] = None
    athlete_id: Optional[str] = None
    discomforts: Optional[Dict[str, str]] = {} 
    sleep_hours: Optional[str] = ""

class UserRegister(BaseModel):
    email: str
    password: str
    name: str
    role: str = "trainer"

class UserLogin(BaseModel):
    email: str
    password: str

class GoogleAuth(BaseModel):
    token: str
    role: Optional[str] = "trainer" 

class AthleteCreate(BaseModel):
    email: str
    password: str
    name: str
    gender: str
    sport: Optional[str] = "Preparación Física"
    phone: Optional[str] = "" 
    has_extra_sport: Optional[bool] = False
    sport_icon: Optional[str] = "kite"

class AthleteUpdate(BaseModel):
    name: Optional[str] = None
    email: Optional[str] = None
    gender: Optional[str] = None
    password: Optional[str] = None
    sport: Optional[str] = None
    phone: Optional[str] = None 
    last_period_date: Optional[str] = None  
    cycle_length: Optional[int] = None      
    period_length: Optional[int] = None     
    is_bleeding: Optional[bool] = None      
    has_extra_sport: Optional[bool] = None
    sport_icon: Optional[str] = None
    technical_sessions: Optional[List[str]] = None
    email_notifications: Optional[bool] = None
    avatar_url: Optional[str] = None

class ProfileUpdate(BaseModel):
    name: Optional[str] = None
    sport: Optional[str] = None
    position: Optional[str] = None
    is_injured: Optional[bool] = None
    injury_notes: Optional[str] = None
    equipment: Optional[str] = None
    last_period_date: Optional[str] = None  
    cycle_length: Optional[int] = None      
    period_length: Optional[int] = None     
    is_bleeding: Optional[bool] = None      
    has_extra_sport: Optional[bool] = None
    sport_icon: Optional[str] = None
    technical_sessions: Optional[List[str]] = None
    email_notifications: Optional[bool] = None
    avatar_url: Optional[str] = None

class CycleUpdate(BaseModel):
    macro_ciclo: str
    micro_ciclo: str

class WorkoutUpdate(BaseModel):
    title: Optional[str] = None
    date: Optional[str] = None        
    athlete_id: Optional[str] = None  
    exercises: Optional[List[dict]] = None
    notes: Optional[str] = None
    completed: Optional[bool] = None
    completion_data: Optional[dict] = None
    observations: Optional[str] = None
    microciclo_id: Optional[str] = None
    is_ai: Optional[bool] = False
    is_test_battery: Optional[bool] = False

class WorkoutCreate(BaseModel):
    title: str
    date: str
    exercises: List[dict]
    notes: Optional[str] = ""
    athlete_id: str
    microciclo_id: Optional[str] = None
    is_ai: Optional[bool] = False
    is_test_battery: Optional[bool] = False
    
class WorkoutBulkCreate(BaseModel):
    workouts: List[WorkoutCreate]
    
class MacroCreate(BaseModel):
    athlete_id: str
    nombre: str
    fecha_inicio: str
    fecha_fin: str
    color: Optional[str] = None
    
class MicroCreate(BaseModel):
    macrociclo_id: str
    nombre: str
    fecha_inicio: str
    fecha_fin: str
    tipo: str
    color: str

class TestCreate(BaseModel):
    athlete_id: str
    test_type: str
    test_name: str
    custom_name: Optional[str] = ""
    value: Optional[float] = None
    unit: str
    date: str
    notes: Optional[str] = ""
    value_left: Optional[float] = None
    value_right: Optional[float] = None

class TestUpdate(BaseModel):
    value: Optional[float] = None
    value_left: Optional[float] = None
    value_right: Optional[float] = None
    unit: Optional[str] = None
    notes: Optional[str] = None
    test_type: Optional[str] = None
    test_name: Optional[str] = None
    custom_name: Optional[str] = None
    date: Optional[str] = None

class GeminiChatRequest(BaseModel):
    userMessage: str
    athleteContext: Optional[dict] = None
    chatHistory: list = []
    athlete_id: Optional[str] = None

# --- MODELOS PYDANTIC ---

class PillCreate(BaseModel):
    name: str
    is_hiit: bool
    exercises: List[dict]
    assigned_athletes: Optional[List[str]] = []
    
# --- AUTH HELPERS ---
def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

def verify_password(password: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(password.encode('utf-8'), (hashed or '').encode('utf-8'))
    except ValueError:
        return False

MIN_PASSWORD_LENGTH = 8

def validate_password(password: str):
    if len(password or '') < MIN_PASSWORD_LENGTH:
        raise HTTPException(status_code=400, detail=f"La contraseña debe tener al menos {MIN_PASSWORD_LENGTH} caracteres")

def create_token(user_id: str, role: str) -> str:
    payload = {
        'user_id': user_id,
        'role': role,
        'exp': datetime.now(timezone.utc) + timedelta(days=JWT_EXPIRATION_DAYS)
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

def decode_token(token: str) -> dict:
    try:
        return jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
    except Exception:
        raise HTTPException(status_code=401, detail="Token inválido o expirado")

async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    payload = decode_token(credentials.credentials)
    user = await db.users.find_one({"id": payload['user_id']}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=401, detail="Usuario no encontrado")
    return user

# --- LÍMITE DE INTENTOS (guardados en la base de datos) ---
# Se guardan en MongoDB y no en la memoria del servidor: en Vercel puede haber varias copias del servidor a la vez
# y cada una tendría su propia cuenta.
LOGIN_MAX_FAILURES = 10
LOGIN_WINDOW_SECONDS = 15 * 60
AI_MAX_REQUESTS_PER_HOUR = int(os.environ.get('AI_MAX_REQUESTS_PER_HOUR', 60))
_rate_index_ready = False

async def _ensure_rate_index():
    global _rate_index_ready
    if _rate_index_ready:
        return
    try:
        # MongoDB borra solo los registros viejos (al día siguiente)
        await db.rate_limits.create_index("expires_at", expireAfterSeconds=0)
    except Exception as e:
        logger.warning(f"No se pudo crear el índice de rate_limits: {e}")
    _rate_index_ready = True

async def too_many_attempts(key: str, limit: int, window_seconds: int) -> bool:
    since = time.time() - window_seconds
    return await db.rate_limits.count_documents({"key": key, "ts": {"$gte": since}}) >= limit

async def record_attempt(key: str):
    await _ensure_rate_index()
    await db.rate_limits.insert_one({"key": key, "ts": time.time(), "expires_at": datetime.now(timezone.utc) + timedelta(days=1)})

async def clear_attempts(key: str):
    await db.rate_limits.delete_many({"key": key})

async def check_ai_quota(user: dict):
    key = f"ai:{user['id']}"
    if await too_many_attempts(key, AI_MAX_REQUESTS_PER_HOUR, 3600):
        raise HTTPException(status_code=429, detail="Has alcanzado el límite de peticiones a la IA. Prueba de nuevo en un rato.")
    await record_attempt(key)

# --- CONTROL DE ACCESO ---
def trainer_signup_allowed(email: str) -> bool:
    """Solo los emails listados en TRAINER_SIGNUP_EMAILS (separados por comas) pueden crear cuentas de entrenador."""
    allowed = {e.strip().lower() for e in os.environ.get('TRAINER_SIGNUP_EMAILS', '').split(',') if e.strip()}
    return (email or '').strip().lower() in allowed

async def find_own_athlete(trainer_id: str, athlete_id: str):
    return await db.users.find_one({"id": athlete_id, "role": "athlete", "trainer_id": trainer_id}, {"_id": 0, "password": 0})

async def ensure_athlete_access(user: dict, athlete_id: Optional[str]) -> dict:
    """Permite el acceso a los datos propios o, si es entrenador, a los de sus atletas. Devuelve el usuario objetivo sin contraseña."""
    if athlete_id and athlete_id == user['id']:
        return {k: v for k, v in user.items() if k not in ('_id', 'password')}
    if athlete_id and user['role'] == 'trainer':
        athlete = await find_own_athlete(user['id'], athlete_id)
        if athlete:
            return athlete
    raise HTTPException(status_code=403, detail="No autorizado")

async def ensure_own_athlete(user: dict, athlete_id: str) -> dict:
    """Solo el entrenador de la atleta puede gestionarla."""
    if user['role'] != 'trainer':
        raise HTTPException(status_code=403, detail="No autorizado")
    athlete = await find_own_athlete(user['id'], athlete_id)
    if not athlete:
        raise HTTPException(status_code=404, detail="Atleta no encontrado")
    return athlete

async def accessible_athlete_ids(user: dict) -> List[str]:
    if user['role'] != 'trainer':
        return [user['id']]
    athletes = await db.users.find({"trainer_id": user['id'], "role": "athlete"}, {"_id": 0, "id": 1}).to_list(1000)
    return [user['id']] + [a['id'] for a in athletes]

async def ensure_macro_access(user: dict, macro_id: str) -> dict:
    macro = await db.macrociclos.find_one({"id": macro_id}, {"_id": 0})
    if not macro:
        raise HTTPException(status_code=404, detail="Macrociclo no encontrado")
    await ensure_athlete_access(user, macro.get('athlete_id'))
    return macro

async def ensure_micro_access(user: dict, micro_id: str) -> dict:
    micro = await db.microciclos.find_one({"id": micro_id}, {"_id": 0})
    if not micro:
        raise HTTPException(status_code=404, detail="Microciclo no encontrado")
    await ensure_macro_access(user, micro.get('macrociclo_id'))
    return micro

async def ensure_workout_access(user: dict, workout_id: str) -> dict:
    workout = await db.workouts.find_one({"id": workout_id}, {"_id": 0})
    if not workout:
        raise HTTPException(status_code=404, detail="Sesión no encontrada")
    await ensure_athlete_access(user, workout.get('athlete_id'))
    return workout

from pywebpush import webpush, WebPushException

def send_email_async(to_email: str, subject: str, body: str, attachments: Optional[list] = None, reply_to: Optional[str] = None):
    smtp_user = os.environ.get("SMTP_USER")
    smtp_pass = os.environ.get("SMTP_PASSWORD")
    smtp_server = os.environ.get("SMTP_SERVER", "smtp.gmail.com")
    smtp_port = int(os.environ.get("SMTP_PORT", 587))

    if not smtp_user or not smtp_pass:
        logger.warning("Credenciales SMTP no configuradas. Saltando envío de email.")
        return False

    try:
        msg = MIMEMultipart()
        msg['From'] = f"Fit Tracker <{smtp_user}>"
        msg['To'] = to_email
        msg['Subject'] = subject
        if reply_to:
            msg['Reply-To'] = reply_to

        # Se envía como HTML para que quede presentable
        msg.attach(MIMEText(body, 'html'))
        for filename, data, subtype in attachments or []:
            from email.mime.image import MIMEImage
            img = MIMEImage(data, _subtype=subtype)
            img.add_header('Content-Disposition', 'attachment', filename=filename)
            msg.attach(img)

        server = smtplib.SMTP(smtp_server, smtp_port, timeout=15)
        server.starttls()
        server.login(smtp_user, smtp_pass)
        server.send_message(msg)
        server.quit()
        logger.info(f"Email enviado correctamente a {to_email}")
        return True
    except Exception as e:
        logger.error(f"Fallo al enviar email a {to_email}: {str(e)}")
        return False

async def notify(background_tasks: BackgroundTasks, func, *args):
    """Envía un email o una notificación.
    En Render se envía después de responder (la app va más rápida). En Vercel se envía antes de responder,
    porque al terminar la respuesta el servidor se "congela" y el aviso podría no salir nunca."""
    if ON_VERCEL:
        try:
            await run_in_threadpool(func, *args)
        except Exception as e:
            logger.error(f"No se pudo enviar el aviso: {e}")
    else:
        background_tasks.add_task(func, *args)

# --- NOTIFICACIONES PUSH (al móvil, también con la app cerrada) ---
# Cada persona puede tener varios dispositivos (colección push_subscriptions) y elige en Ajustes qué avisos recibe
# (campo push_prefs del usuario). Las claves VAPID (las que identifican al servidor ante Google/Apple/Mozilla) se leen de
# VAPID_PRIVATE_KEY o, si no existe, se crean una vez y se guardan en la base de datos: no hay que configurar nada.
VAPID_CLAIMS = {"sub": os.environ.get('VAPID_SUBJECT', "mailto:claudiakiter31@gmail.com")}

# Avisos que puede elegir cada perfil, con su valor por defecto
PUSH_EVENTS = {
    "athlete": {
        "workout_assigned": True,    # el entrenador te programa una sesión
        "workout_changed": True,     # cambia de fecha, de ejercicios o la quita
        "coach_feedback": True,      # correcciones en vídeos y notas en los ejercicios
        "report_updates": True,      # respuesta o solución a un problema que ha informado
    },
    "trainer": {
        "workout_completed": True,   # una deportista termina una sesión
        "workout_skipped": True,     # marca una sesión como no hecha
        "wellness_alert": True,      # bienestar con fatiga/dolor/estrés altos, mal sueño, molestias o lesión
        "wellness_submitted": False, # todos los formularios de bienestar
        "video_uploaded": True,      # sube un vídeo de técnica o comenta uno
        "test_recorded": True,       # registra un test o una medida
        "problem_reported": True,    # una deportista informa de un problema en la app
    },
}

# Solo se envían avisos a los servicios de notificaciones de verdad (evita que alguien use el servidor para llamar a otras webs)
PUSH_ENDPOINT_HOSTS = ("fcm.googleapis.com", "android.googleapis.com", "push.services.mozilla.com", "push.apple.com", "notify.windows.com")

_vapid_cache: Dict[str, Any] = {}

def _vapid_from_text(text: str):
    from py_vapid import Vapid02
    text = text.strip()
    if 'BEGIN' in text:
        return Vapid02.from_pem(text.encode())
    return Vapid02.from_string(text)

def _vapid_public_key(vv) -> str:
    from cryptography.hazmat.primitives import serialization
    import base64
    raw = vv.public_key.public_bytes(serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint)
    return base64.urlsafe_b64encode(raw).decode().rstrip('=')

async def get_vapid():
    """Devuelve (clave privada para firmar, clave pública para el navegador)."""
    if _vapid_cache.get('vv'):
        return _vapid_cache['vv'], _vapid_cache['public']
    vv = None
    env_key = os.environ.get('VAPID_PRIVATE_KEY')
    if env_key:
        try:
            vv = _vapid_from_text(env_key)
        except Exception as e:
            logger.error(f"VAPID_PRIVATE_KEY no es válida ({type(e).__name__}); se usa la clave guardada en la base de datos.")
    if vv is None:
        from py_vapid import Vapid02
        import base64
        doc = await db.app_config.find_one({"_id": "vapid"})
        if not doc:
            new = Vapid02()
            new.generate_keys()
            raw = new.private_key.private_numbers().private_value.to_bytes(32, 'big')
            try:
                await db.app_config.insert_one({"_id": "vapid", "private_raw": base64.urlsafe_b64encode(raw).decode().rstrip('='),
                                                "created_at": datetime.now(timezone.utc).isoformat()})
            except Exception:
                pass  # otra copia del servidor la creó a la vez: usamos la suya
            doc = await db.app_config.find_one({"_id": "vapid"})
        vv = Vapid02.from_raw(doc["private_raw"].encode())
    _vapid_cache.update(vv=vv, public=_vapid_public_key(vv))
    return _vapid_cache['vv'], _vapid_cache['public']

def push_pref_enabled(target_user: dict, event: str) -> bool:
    defaults = PUSH_EVENTS.get(target_user.get('role') or '', {})
    if event not in defaults:
        return False
    prefs = target_user.get('push_prefs') or {}
    value = prefs.get(event)
    return defaults[event] if value is None else bool(value)

def _webpush_one(sub: dict, payload: str, vv) -> str:
    """Envía un aviso a un dispositivo. Devuelve 'ok', 'gone' (el dispositivo ya no existe) o 'error'."""
    try:
        webpush(subscription_info={"endpoint": sub["endpoint"], "keys": sub["keys"]}, data=payload,
                vapid_private_key=vv, vapid_claims=dict(VAPID_CLAIMS), ttl=24 * 3600, timeout=8,
                headers={"Urgency": "high"})
        return 'ok'
    except WebPushException as e:
        status = getattr(getattr(e, 'response', None), 'status_code', None)
        if status in (403, 404, 410):
            return 'gone'
        logger.warning(f"Aviso push no enviado ({status}): {str(e)[:200]}")
        return 'error'
    except Exception as e:
        logger.warning(f"Aviso push no enviado: {type(e).__name__}: {str(e)[:200]}")
        return 'error'

async def deliver_push(subs: list, payload: dict) -> int:
    if not subs:
        return 0
    vv, _ = await get_vapid()
    text = json.dumps(payload, ensure_ascii=False)
    results = await asyncio.gather(*(run_in_threadpool(_webpush_one, s, text, vv) for s in subs))
    gone = [s["endpoint"] for s, r in zip(subs, results) if r == 'gone']
    if gone:
        await db.push_subscriptions.delete_many({"endpoint": {"$in": gone}})
    ok = [s["endpoint"] for s, r in zip(subs, results) if r == 'ok']
    if ok:
        await db.push_subscriptions.update_many({"endpoint": {"$in": ok}}, {"$set": {"last_ok_at": datetime.now(timezone.utc).isoformat()}})
    return len(ok)

async def push_to_user(user_id: str, event: Optional[str], title: str, body: str, url: str = "/", tag: Optional[str] = None) -> int:
    """Envía un aviso a todos los dispositivos de una persona, si tiene ese tipo de aviso activado (event=None: siempre)."""
    try:
        target = await db.users.find_one({"id": user_id}, {"_id": 0, "role": 1, "push_prefs": 1})
        if not target or (event and not push_pref_enabled(target, event)):
            return 0
        subs = await db.push_subscriptions.find({"user_id": user_id}, {"_id": 0, "endpoint": 1, "keys": 1}).to_list(20)
        payload = {"title": title[:120], "body": body[:400], "url": url or "/", "tag": tag or event or "general"}
        return await asyncio.wait_for(deliver_push(subs, payload), timeout=12)
    except Exception as e:
        logger.error(f"No se pudo enviar el aviso push: {type(e).__name__}: {e}")
        return 0

async def push_event(background_tasks: BackgroundTasks, user_id: Optional[str], event: str, title: str, body: str, url: str = "/", tag: Optional[str] = None):
    """Como notify(): en Vercel se envía antes de responder; en un servidor normal, después."""
    if not user_id:
        return
    if ON_VERCEL:
        await push_to_user(user_id, event, title, body, url, tag)
    else:
        background_tasks.add_task(push_to_user, user_id, event, title, body, url, tag)

try:
    from zoneinfo import ZoneInfo
    _APP_TZ = ZoneInfo(os.environ.get('APP_TIMEZONE', 'Europe/Madrid'))
except Exception:
    _APP_TZ = timezone.utc

DIAS_SEMANA = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"]

def local_today() -> str:
    return datetime.now(_APP_TZ).date().isoformat()

def fecha_amable(date_str: str) -> str:
    """'2026-11-24' -> 'hoy', 'mañana' o 'el lunes 24/11'."""
    try:
        d = datetime.strptime((date_str or '')[:10], "%Y-%m-%d").date()
    except ValueError:
        return date_str or ''
    today = datetime.now(_APP_TZ).date()
    if d == today: return "hoy"
    if d == today + timedelta(days=1): return "mañana"
    return f"el {DIAS_SEMANA[d.weekday()]} {d.day}/{d.month}"

def athlete_url(athlete: dict) -> str:
    from urllib.parse import urlencode
    return "/athlete-detail?" + urlencode({"id": athlete.get('id', ''), "name": athlete.get('name', '')})

class PushKeys(BaseModel):
    p256dh: str
    auth: str

class PushSubscriptionIn(BaseModel):
    endpoint: str
    keys: PushKeys

class PushSubscribeRequest(BaseModel):
    subscription: PushSubscriptionIn
    device: Optional[str] = ''

class PushUnsubscribeRequest(BaseModel):
    endpoint: str

class PushPrefsUpdate(BaseModel):
    prefs: Dict[str, bool]

def push_endpoint_allowed(endpoint: str) -> bool:
    from urllib.parse import urlparse
    try:
        u = urlparse(endpoint)
    except Exception:
        return False
    host = (u.hostname or '').lower()
    return u.scheme == 'https' and any(host == h or host.endswith('.' + h) for h in PUSH_ENDPOINT_HOSTS)

def push_prefs_for(user: dict) -> dict:
    return {k: push_pref_enabled(user, k) for k in PUSH_EVENTS.get(user.get('role') or '', {})}

@api_router.get("/push/config")
async def push_config(user=Depends(get_current_user)):
    _, public_key = await get_vapid()
    devices = await db.push_subscriptions.count_documents({"user_id": user['id']})
    return {"public_key": public_key, "prefs": push_prefs_for(user), "devices": devices}

@api_router.put("/push/prefs")
async def update_push_prefs(data: PushPrefsUpdate, user=Depends(get_current_user)):
    allowed = PUSH_EVENTS.get(user.get('role') or '', {})
    clean = {k: bool(v) for k, v in data.prefs.items() if k in allowed}
    if clean:
        await db.users.update_one({"id": user['id']}, {"$set": {f"push_prefs.{k}": v for k, v in clean.items()}})
    updated = await db.users.find_one({"id": user['id']}, {"_id": 0, "role": 1, "push_prefs": 1})
    return {"prefs": push_prefs_for(updated or user)}

@api_router.post("/push/subscribe")
async def push_subscribe(data: PushSubscribeRequest, user=Depends(get_current_user)):
    sub = data.subscription
    if len(sub.endpoint) > 1000 or not push_endpoint_allowed(sub.endpoint):
        raise HTTPException(status_code=400, detail="Este navegador no es compatible con las notificaciones de la app.")
    now = datetime.now(timezone.utc).isoformat()
    # El mismo dispositivo solo pertenece a una cuenta: si otra persona inicia sesión en él, pasa a ser suyo
    await db.push_subscriptions.update_one(
        {"endpoint": sub.endpoint},
        {"$set": {"user_id": user['id'], "keys": {"p256dh": sub.keys.p256dh[:200], "auth": sub.keys.auth[:100]},
                  "device": (data.device or '')[:80], "updated_at": now},
         "$setOnInsert": {"id": str(uuid.uuid4()), "created_at": now}},
        upsert=True)
    return {"status": "subscribed", "devices": await db.push_subscriptions.count_documents({"user_id": user['id']})}

@api_router.post("/push/unsubscribe")
async def push_unsubscribe(data: PushUnsubscribeRequest, user=Depends(get_current_user)):
    await db.push_subscriptions.delete_one({"endpoint": data.endpoint, "user_id": user['id']})
    return {"status": "unsubscribed", "devices": await db.push_subscriptions.count_documents({"user_id": user['id']})}

@api_router.post("/push/test")
async def push_test(user=Depends(get_current_user)):
    devices = await db.push_subscriptions.count_documents({"user_id": user['id']})
    if not devices:
        raise HTTPException(status_code=400, detail="Activa primero las notificaciones en este dispositivo.")
    sent = await push_to_user(user['id'], None, "🔔 Notificaciones activadas", "Así te llegarán los avisos de AM Coaching.", "/settings", "test")
    return {"sent": sent, "devices": devices}

# --- INFORMES DE PROBLEMAS (Ajustes > Informar de un problema) ---
# Se guardan en la base de datos, llegan por email al correo de desarrollo de la app (se puede cambiar con SUPPORT_EMAIL)
# y el entrenador los ve en Ajustes > Problemas reportados, donde puede responder y marcarlos como resueltos.
REPORT_CATEGORIES = {"bug": "Algo no funciona", "idea": "Sugerencia", "other": "Otra cosa"}
REPORT_MAX_PER_HOUR = 10
REPORT_SCREENSHOT_MAX_CHARS = 1_600_000   # ~1,2 MB de imagen
_SCREENSHOT_RE = re.compile(r'^data:image/(jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$')

class ProblemReportCreate(BaseModel):
    category: str = "bug"
    area: Optional[str] = ""
    description: str
    screenshot: Optional[str] = None      # data:image/jpeg;base64,...
    diagnostics: Optional[dict] = None    # dispositivo, navegador, versión de la app, errores recientes…

class ProblemReportUpdate(BaseModel):
    status: Optional[str] = None          # 'open' | 'resolved'
    reply: Optional[str] = None

DEV_SUPPORT_EMAIL = "claudiakiter31@gmail.com"  # correo de desarrollo de la app

def support_emails() -> list:
    raw = os.environ.get('SUPPORT_EMAIL') or DEV_SUPPORT_EMAIL
    return [e.strip() for e in raw.split(',') if '@' in e]

def _clean_diagnostics(d) -> dict:
    out = {}
    if not isinstance(d, dict):
        return out
    for k, v in list(d.items())[:40]:
        key = str(k)[:40]
        if isinstance(v, list):
            out[key] = [str(x)[:300] for x in v[:10]]
        elif v is None or isinstance(v, (bool, int, float)):
            out[key] = v
        else:
            out[key] = str(v)[:500]
    return out

async def _get_accessible_report(user: dict, report_id: str) -> dict:
    report = await db.problem_reports.find_one({"id": report_id}, {"_id": 0})
    if not report or not (report.get('user_id') == user['id'] or (user['role'] == 'trainer' and report.get('trainer_id') == user['id'])):
        raise HTTPException(status_code=404, detail="Informe no encontrado")
    return report

def _report_email_html(report: dict) -> str:
    e = html.escape
    rows = "".join(f"<tr><td style='color:#64748b;padding:2px 10px 2px 0'>{e(str(k))}</td><td>{e(json.dumps(v, ensure_ascii=False) if isinstance(v, list) else str(v))}</td></tr>"
                   for k, v in (report.get('diagnostics') or {}).items())
    return f"""
    <h3>{e(REPORT_CATEGORIES.get(report['category'], 'Informe'))} · {e(report.get('area') or 'Sin indicar')}</h3>
    <p><b>{e(report.get('user_name', ''))}</b> ({e(report.get('role', ''))}, {e(report.get('user_email', ''))}) · referencia <b>{e(report['ref'])}</b></p>
    <p style="white-space:pre-wrap;background:#f1f5f9;padding:12px;border-radius:8px">{e(report['description'])}</p>
    <p>{'📎 Captura de pantalla adjunta.' if report.get('has_screenshot') else 'Sin captura de pantalla.'}</p>
    <h4>Datos del dispositivo</h4><table style="font-size:13px">{rows or '<tr><td>No disponibles</td></tr>'}</table>
    """

@api_router.post("/reports")
async def create_problem_report(data: ProblemReportCreate, background_tasks: BackgroundTasks, user=Depends(get_current_user)):
    description = (data.description or '').strip()
    if len(description) < 10:
        raise HTTPException(status_code=400, detail="Cuéntanos un poco más (mínimo 10 caracteres).")
    shot = None
    if data.screenshot:
        m = _SCREENSHOT_RE.match(data.screenshot)
        if not m or len(data.screenshot) > REPORT_SCREENSHOT_MAX_CHARS:
            raise HTTPException(status_code=400, detail="La captura no es válida o es demasiado grande.")
        shot = (m.group(1), data.screenshot)
    since = (datetime.now(timezone.utc) - timedelta(hours=1)).isoformat()
    if await db.problem_reports.count_documents({"user_id": user['id'], "created_at": {"$gte": since}}) >= REPORT_MAX_PER_HOUR:
        raise HTTPException(status_code=429, detail="Has enviado muchos informes seguidos. Inténtalo dentro de un rato.")

    report_id = str(uuid.uuid4())
    report = {
        "id": report_id, "ref": report_id[:6].upper(),
        "user_id": user['id'], "user_name": user.get('name', ''), "user_email": user.get('email', ''), "role": user['role'],
        "trainer_id": user['id'] if user['role'] == 'trainer' else user.get('trainer_id'),
        "category": data.category if data.category in REPORT_CATEGORIES else "other",
        "area": (data.area or '').strip()[:60], "description": description[:4000],
        "diagnostics": _clean_diagnostics(data.diagnostics), "has_screenshot": bool(shot),
        "status": "open", "reply": "", "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.problem_reports.insert_one(report)
    report.pop('_id', None)
    if shot:
        await db.problem_report_images.insert_one({"report_id": report_id, "data": shot[1]})

    to = support_emails()
    if to:
        attachments = []
        if shot:
            import base64 as _b64
            ext = 'jpg' if shot[0] == 'jpeg' else shot[0]
            attachments.append((f"captura-{report['ref']}.{ext}", _b64.b64decode(shot[1].split(',', 1)[1]), shot[0]))
        subject = f"🐞 [{REPORT_CATEGORIES[report['category']]}] {report['user_name']}: {description[:60]}"
        await notify(background_tasks, send_email_async, ", ".join(to), subject, _report_email_html(report), attachments, report.get('user_email') or None)
    if user['role'] == 'athlete' and user.get('trainer_id'):
        await push_event(background_tasks, user['trainer_id'], "problem_reported", f"🐞 {user.get('name', 'Una deportista')} ha informado de un problema",
                         f"{report['area'] or REPORT_CATEGORIES[report['category']]}: {description[:150]}", "/settings?reports=1", f"report-{report_id}")
    return report

@api_router.get("/reports")
async def list_problem_reports(user=Depends(get_current_user)):
    query = {"trainer_id": user['id']} if user['role'] == 'trainer' else {"user_id": user['id']}
    return await db.problem_reports.find(query, {"_id": 0}).sort("created_at", -1).to_list(200)

@api_router.get("/reports/{report_id}/screenshot")
async def get_problem_report_screenshot(report_id: str, user=Depends(get_current_user)):
    await _get_accessible_report(user, report_id)
    img = await db.problem_report_images.find_one({"report_id": report_id}, {"_id": 0})
    if not img:
        raise HTTPException(status_code=404, detail="Este informe no tiene captura")
    return {"data": img["data"]}

@api_router.patch("/reports/{report_id}")
async def update_problem_report(report_id: str, data: ProblemReportUpdate, background_tasks: BackgroundTasks, user=Depends(get_current_user)):
    report = await _get_accessible_report(user, report_id)
    if user['role'] != 'trainer':
        raise HTTPException(status_code=403, detail="Solo el entrenador puede responder a los informes")
    now = datetime.now(timezone.utc).isoformat()
    changes = {}
    if data.status in ("open", "resolved") and data.status != report.get('status'):
        changes.update(status=data.status, resolved_at=now if data.status == "resolved" else None)
    if data.reply is not None and data.reply.strip() != (report.get('reply') or ''):
        changes.update(reply=data.reply.strip()[:2000], replied_at=now, replied_by=user.get('name', ''))
    if changes:
        await db.problem_reports.update_one({"id": report_id}, {"$set": changes})
        report.update(changes)
        if report['user_id'] != user['id'] and (changes.get('status') == 'resolved' or changes.get('reply')):
            title = "✅ Tu informe está resuelto" if report['status'] == 'resolved' else "💬 Respuesta a tu informe"
            body = report.get('reply') or f"«{report['description'][:120]}»"
            await push_event(background_tasks, report['user_id'], "report_updates", title, body, "/settings?reports=1", f"report-{report_id}")
    return report

@api_router.delete("/reports/{report_id}")
async def delete_problem_report(report_id: str, user=Depends(get_current_user)):
    await _get_accessible_report(user, report_id)
    await db.problem_reports.delete_one({"id": report_id})
    await db.problem_report_images.delete_one({"report_id": report_id})
    return {"status": "deleted"}

# --- RUTAS DE PÍLDORAS (PREHAB/ACTIVACIÓN) ---
@api_router.post("/pills")
async def create_pill(data: PillCreate, user=Depends(get_current_user)):
    if user['role'] != 'trainer': raise HTTPException(status_code=403, detail="No autorizado")
    pill = data.dict()
    pill.update({"id": str(uuid.uuid4()), "trainer_id": user['id'], "created_at": datetime.now(timezone.utc).isoformat()})
    await db.pills.insert_one(pill)
    pill.pop('_id', None)
    return {"status": "success", "pill": pill}

@api_router.get("/pills")
async def get_pills(user=Depends(get_current_user)):
    target_trainer_id = user['id'] if user['role'] == 'trainer' else user.get('trainer_id')
    pills = await db.pills.find({"trainer_id": target_trainer_id}, {"_id": 0}).sort("created_at", -1).to_list(100)
    return pills

@api_router.put("/pills/{pill_id}")
async def update_pill(pill_id: str, data: PillCreate, user=Depends(get_current_user)):
    if user['role'] != 'trainer': raise HTTPException(status_code=403, detail="No autorizado")
    update_data = data.dict()
    await db.pills.update_one(
        {"id": pill_id, "trainer_id": user['id']},
        {"$set": update_data}
    )
    return {"status": "success"}

@api_router.delete("/pills/{pill_id}")
async def delete_pill(pill_id: str, user=Depends(get_current_user)):
    if user['role'] != 'trainer': raise HTTPException(status_code=403, detail="No autorizado")
    await db.pills.delete_one({"id": pill_id, "trainer_id": user['id']})
    return {"status": "success"}

# --- RUTAS DE MACHINE LEARNING (CEREBRO IA) ---
@api_router.get("/brain/memory")
async def get_brain_memory(user=Depends(get_current_user)):
    if user['role'] != 'trainer': raise HTTPException(status_code=403, detail="No autorizado")
    count = await db.brain_memory.count_documents({"trainer_id": user['id']})
    return {"status": "success", "total_learned": count}

@api_router.get("/brain/memory/examples")
async def get_brain_examples(user=Depends(get_current_user)):
    if user['role'] != 'trainer': raise HTTPException(status_code=403, detail="No autorizado")
    examples = await db.brain_memory.find({"trainer_id": user['id']}, {"_id": 0, "learned_at": 0, "id": 0, "trainer_id": 0}).sort("learned_at", -1).limit(5).to_list(5)
    return {"status": "success", "examples": examples}

# --- LLAMADAS A GEMINI ---
def parse_ai_json(text: str) -> dict:
    raw = (text or "").strip()
    if raw.startswith("```"):
        raw = raw.replace("```json", "").replace("```", "").strip()
    try:
        return json.loads(raw)
    except Exception:
        start, end = raw.find("{"), raw.rfind("}")
        if start != -1 and end > start:
            return json.loads(raw[start:end + 1])
        raise

async def gemini_generate(model: str, system_prompt: str, contents: list, timeout_s: float = 45) -> str:
    """Una petición a un modelo concreto, con un tiempo máximo. Devuelve el texto (JSON) de la respuesta."""
    # Sin límite, la librería de Google espera indefinidamente: por eso a veces "no respondía nunca"
    response = await asyncio.wait_for(
        get_gemini_client().aio.models.generate_content(
            model=model,
            contents=contents,
            config=genai_types.GenerateContentConfig(
                system_instruction=system_prompt,
                response_mime_type="application/json",
                http_options=genai_types.HttpOptions(timeout=int(timeout_s * 1000)),
            ),
        ),
        timeout=timeout_s + 2,
    )
    return response.text or ""

async def discover_gemini_models() -> List[str]:
    """Si fallan todos los modelos configurados, pregunta a Google qué modelos Flash tiene disponibles esta clave."""
    global _gemini_discovered
    if _gemini_discovered:
        return _gemini_discovered
    found = []
    pager = await get_gemini_client().aio.models.list()
    async for m in pager:
        name = (m.name or "").replace("models/", "")
        actions = m.supported_actions or []
        if "generateContent" in actions and "flash" in name and not re.search(r"image|tts|audio|live|embed|lite|exp|thinking", name):
            found.append(name)
    found.sort(reverse=True)  # versiones más nuevas primero
    _gemini_discovered = found[:3]
    logger.info(f"Modelos Gemini disponibles detectados: {_gemini_discovered}")
    return _gemini_discovered

def _is_key_error(e: Exception) -> bool:
    text = str(e)
    # Solo la clave en sí; un 403 puede ser "este modelo no está disponible para ti" y entonces se prueba el siguiente
    return "API key" in text or "API_KEY_INVALID" in text or getattr(e, "code", None) == 401

def _is_quota_error(e: Exception) -> bool:
    text = str(e)
    return getattr(e, "code", None) == 429 or "429" in text or "RESOURCE_EXHAUSTED" in text or "quota" in text.lower()

async def ask_gemini_json(system_prompt: str, user_message: str, history: Optional[list] = None) -> dict:
    """Pide a Gemini una respuesta en JSON probando varios modelos hasta que uno responda bien."""
    if not GEMINI_API_KEY:
        raise HTTPException(status_code=500, detail="La IA no está configurada en el servidor (falta GEMINI_API_KEY).")

    contents = []
    for h in (history or [])[-12:]:
        role = "model" if h.get("role") in ("model", "assistant") else "user"
        text = " ".join(str(p.get("text", "")) for p in (h.get("parts") or []) if isinstance(p, dict)).strip()
        if text:
            contents.append(genai_types.Content(role=role, parts=[genai_types.Part(text=text)]))
    contents.append(genai_types.Content(role="user", parts=[genai_types.Part(text=user_message)]))

    tried, quota_failures, key_invalid, timeouts = [], 0, False, 0
    deadline = time.time() + GEMINI_TOTAL_BUDGET_SECONDS

    async def try_models(models: List[str]):
        nonlocal quota_failures, key_invalid, timeouts
        for model in models:
            if model in tried or key_invalid:
                continue
            remaining = deadline - time.time()
            if remaining < 8:  # no queda tiempo para otro intento
                break
            tried.append(model)
            started = time.time()
            try:
                result = parse_ai_json(await gemini_generate(model, system_prompt, contents, min(GEMINI_TIMEOUT_SECONDS, remaining - 3)))
                logger.info(f"Gemini: respuesta de {model} en {time.time() - started:.1f}s")
                return result
            except asyncio.TimeoutError:
                timeouts += 1
                GEMINI_COOLDOWN_UNTIL[model] = time.time() + 300  # durante 5 min, empezar por el siguiente modelo
                logger.warning(f"Gemini: el modelo {model} ha tardado más de {time.time() - started:.0f}s. Probando el siguiente...")
                continue
            except Exception as e:
                if _is_key_error(e):
                    key_invalid = True
                    logger.error(f"Gemini: la clave GEMINI_API_KEY no es válida o no tiene permiso ({str(e)[:200]})")
                    return None
                if _is_quota_error(e):
                    quota_failures += 1
                    GEMINI_COOLDOWN_UNTIL[model] = time.time() + 60
                logger.warning(f"Gemini: el modelo {model} ha fallado ({type(e).__name__}: {str(e)[:300]}). Probando el siguiente...")
        return None

    now = time.time()
    available = [m for m in GEMINI_MODELS if GEMINI_COOLDOWN_UNTIL.get(m, 0) <= now] or list(GEMINI_MODELS)
    result = await try_models(available)
    if result is None and not key_invalid:
        try:
            result = await try_models(await discover_gemini_models())
        except Exception as e:
            logger.warning(f"Gemini: no se pudo consultar la lista de modelos ({str(e)[:200]})")
    if result is None:
        logger.error(f"Gemini: han fallado todos los modelos probados: {tried}")
        if key_invalid:
            raise HTTPException(status_code=500, detail="La clave de la IA (GEMINI_API_KEY) no es válida o ha caducado. Hay que renovarla en Render.")
        if tried and quota_failures == len(tried):
            raise HTTPException(status_code=429, detail="La IA está saturada en este momento. Prueba de nuevo en un minuto.")
        if timeouts:
            raise HTTPException(status_code=504, detail="La IA está tardando demasiado en responder. Vuelve a intentarlo; si pides varias sesiones, prueba con una cada vez.")
        raise HTTPException(status_code=503, detail="La IA no responde ahora mismo. Inténtalo de nuevo en unos minutos.")
    return result

def today_context() -> str:
    """Fecha de hoy en España, para que la IA entienda "mañana", "el viernes"..."""
    try:
        from zoneinfo import ZoneInfo
        now = datetime.now(ZoneInfo("Europe/Madrid"))
    except Exception:
        now = datetime.now(timezone.utc)
    dias = ["lunes", "martes", "miércoles", "jueves", "viernes", "sábado", "domingo"]
    return f"Hoy es {dias[now.weekday()]} {now.strftime('%Y-%m-%d')}."

def normalize_ai_workouts(result: Any) -> dict:
    """Acepta una o varias sesiones y devuelve siempre 'workouts' (lista) y 'workoutData' (la primera, para versiones antiguas de la app)."""
    if isinstance(result, list):  # a veces el modelo devuelve directamente la lista de sesiones
        result = {"workouts": result}
    if not isinstance(result, dict):
        result = {"response_message": str(result)}
    workouts = result.get("workouts")
    if not isinstance(workouts, list):
        workouts = [result["workoutData"]] if isinstance(result.get("workoutData"), dict) else []
    workouts = [w for w in workouts if isinstance(w, dict) and w.get("exercises")]
    result["workouts"] = workouts
    result["workoutData"] = workouts[0] if workouts else None
    return result

@api_router.post("/brain/generate-workout")
async def generate_workout_api(data: GeminiChatRequest, user=Depends(get_current_user)):
    if not GEMINI_API_KEY:
        raise HTTPException(status_code=500, detail="La IA no está configurada en el servidor (falta GEMINI_API_KEY).")

    if data.athlete_id:
        await ensure_athlete_access(user, data.athlete_id)
    await check_ai_quota(user)
        
    try:
        contexto_atleta = ""
        nombre_atleta = "el atleta"
        
        if data.athlete_id:
            athlete = await db.users.find_one({"id": data.athlete_id})
            if athlete:
                nombre_atleta = athlete.get('name', 'Atleta')
                contexto_atleta += f"PERFIL: {nombre_atleta}, Género: {athlete.get('gender', 'N/A')}, Deporte: {athlete.get('sport', 'N/A')}.\n"
                if athlete.get('is_injured'):
                    contexto_atleta += f"🚨 ALERTA MÉDICA: El atleta está lesionado/a. Notas: {athlete.get('injury_notes', '')}\n"
                if athlete.get('equipment'):
                    contexto_atleta += f"🛠️ MATERIAL DISPONIBLE: {athlete.get('equipment')}\n"

            recent_workouts = await db.workouts.find(
                {"athlete_id": data.athlete_id, "completed": True}
            ).sort("date", -1).limit(3).to_list(3)
            
            if recent_workouts:
                contexto_atleta += "\nHISTORIAL RECIENTE (Últimas sesiones completadas):\n"
                for w in recent_workouts:
                    # Una sesión saltada está "completada" pero sin resultados (completion_data = None)
                    if '[NO COMPLETADA]' in (w.get('observations') or ''):
                        contexto_atleta += f"- {w.get('title')}: NO la hizo ({(w.get('observations') or '').replace('[NO COMPLETADA] ', '')}).\n"
                        continue
                    rpe = (w.get('completion_data') or {}).get('rpe') or '?'
                    nombres_ejercicios = [str(ex.get('name')) for ex in (w.get('exercises') or [])[:3] if isinstance(ex, dict) and ex.get('name')]
                    contexto_atleta += f"- {w.get('title')} (RPE reportado: {rpe}/10). Ejercicios: {', '.join(nombres_ejercicios)}...\n"
                    
            today = datetime.now(timezone.utc).isoformat().split('T')[0]
            athlete_macros = await db.macrociclos.find({"athlete_id": data.athlete_id}, {"_id": 0, "id": 1}).to_list(100)
            current_micro = await db.microciclos.find_one({
                "macrociclo_id": {"$in": [m.get('id') for m in athlete_macros]},
                "fecha_inicio": {"$lte": today},
                "fecha_fin": {"$gte": today}
            })
            if current_micro:
                contexto_atleta += f"\n📅 FASE DE PERIODIZACIÓN ACTUAL: {current_micro.get('nombre')} (Tipo: {current_micro.get('tipo', 'CARGA')}). Adapta la intensidad a esta fase.\n"

        estado = data.athleteContext if isinstance(data.athleteContext, dict) else {}
        fatiga = estado.get('fatigue', '-')
        dolor = estado.get('soreness', '-')
        fase_ciclo = estado.get('cycle_phase') or estado.get('cyclePhase') or 'No registrada'
        
        system_prompt = f"""
        Eres un preparador físico de élite y experto en alto rendimiento.
        Estás diseñando una sesión para {nombre_atleta}.
        Tu tono es conversacional, cercano, empático pero muy profesional y basado en la ciencia deportiva. 
        
        CONTEXTO BIOMÉTRICO Y DEPORTIVO DE {nombre_atleta.upper()}:
        {contexto_atleta}
        
        ESTADO HOY: 
        Fatiga {fatiga}/5, Dolor/Agujetas {dolor}/5. Fase del ciclo: {fase_ciclo}.

        FECHA: {today_context()} Si piden sesiones para "mañana", "el viernes", etc., calcula la fecha exacta (AAAA-MM-DD).
        Si piden varias sesiones o varios días, crea una sesión por día dentro de "workouts".
        Si la petición no es para crear o cambiar sesiones (una duda, un consejo...), responde en "response_message" y deja "workouts" vacío.

        RESPONDE ÚNICAMENTE CON JSON PURO USANDO ESTA ESTRUCTURA EXACTA. 
        Tienes dos formas de crear bloques dentro de "exercises": TRADICIONAL (Fuerza) o HIIT (Circuito). Puedes mezclarlos.
        Para ejercicios por tiempo usa "duration" (ej. "30s") y deja "reps" vacío.

        {{
            "response_message": "Respuesta breve y motivadora dirigiéndote a {nombre_atleta}. Explica en 1-3 frases cómo has adaptado la sesión a su fatiga, lesiones o historial.",
            "workouts": [{{
                "date": "AAAA-MM-DD (o vacío si no se ha dicho un día)",
                "title": "Nombre de la sesión",
                "notes": "Indicaciones generales (calentamiento, enfoque).",
                "exercises": [
                    {{
                        "is_hiit_block": false,
                        "name": "Sentadilla Búlgara", 
                        "sets": "3", 
                        "reps": "10-12", 
                        "duration": "", 
                        "weight": "", 
                        "rest": "90s", 
                        "rest_exercise": "60s", 
                        "exercise_notes": "Enfoque en excéntrica."
                    }},
                    {{
                        "is_hiit_block": true,
                        "name": "Metcon Finisher",
                        "sets": "4", 
                        "rest_exercise": "15s", 
                        "rest_block": "60s", 
                        "rest_between_blocks": "2m", 
                        "hiit_exercises": [
                            {{
                                "name": "Burpees", 
                                "sets": "1", 
                                "duration_reps": "15", 
                                "duration": "45s", 
                                "exercise_notes": "Ritmo constante"
                            }}
                        ]
                    }}
                ]
            }}]
        }}
        """

        result = await ask_gemini_json(system_prompt, data.userMessage, data.chatHistory)
        return normalize_ai_workouts(result)
        
    except HTTPException:
        raise
    except Exception as e:
        logger.exception(f"Error general en endpoint IA: {str(e)}")
        # El tipo de error ayuda a encontrar la causa si vuelve a pasar (sale en el mensaje de la app)
        raise HTTPException(status_code=500, detail=f"Error preparando la petición a la IA ({type(e).__name__}). Inténtalo de nuevo; si se repite, avisa.")

@api_router.post("/brain/analyze-analytics")
async def analyze_analytics_api(data: AnalyticsAnalyzeRequest, user=Depends(get_current_user)):
    if not GEMINI_API_KEY:
        raise HTTPException(status_code=500, detail="La IA no está configurada en el servidor (falta GEMINI_API_KEY).")
    await check_ai_quota(user)
        
    try:
        days = data.period_days if data.period_days and 1 <= data.period_days <= 366 else 14
        resumen = ''
        if data.summary:
            resumen = json.dumps(data.summary, ensure_ascii=False, default=str)[:8000]
        system_prompt = f"""
        Eres un preparador físico de élite analizando los datos de {data.athlete_name} para su informe de rendimiento.
        Escribe en español, con tono profesional, cercano y directo. Usa los números que te doy; no inventes datos.
        Si faltan datos (p. ej. no registra el bienestar), dilo y recomienda registrarlos.

        Periodo analizado: últimos {days} días. {('Fase de la planificación: ' + data.current_phase + '.') if data.current_phase else ''}
        - Fatiga (0-5) en el periodo (null = sin registro): {data.fatigue_data}
        - Agujetas/dolor (0-5) en el periodo: {data.soreness_data}
        - Sesiones hechas: {data.recent_workouts_count}
        - Mejores marcas: {', '.join(map(str, data.recent_prs)) if data.recent_prs else 'Ninguna registrada'}
        {('- Resumen completo del periodo (JSON): ' + resumen) if resumen else ''}

        RESPONDE ÚNICAMENTE CON JSON PURO USANDO ESTA ESTRUCTURA EXACTA:
        {{
            "workload_analysis": "Un párrafo (3-5 frases) sobre carga, fatiga, sueño y molestias: ¿asimila bien las cargas o hay señales de riesgo?",
            "progress_analysis": "Un párrafo (3-5 frases) sobre cumplimiento de sesiones, tests y marcas: qué mejora y qué no.",
            "recommendations": ["3 o 4 recomendaciones concretas y accionables para las próximas semanas"]
        }}
        """

        result = await ask_gemini_json(system_prompt, "Analiza los datos y responde con el JSON indicado.")
        if isinstance(result, list):
            result = result[0] if result and isinstance(result[0], dict) else {}
        if not isinstance(result, dict):
            result = {}
        recs = result.get('recommendations') or []
        if isinstance(recs, str):
            recs = [recs]
        return {
            "workload_analysis": str(result.get('workload_analysis') or ''),
            "progress_analysis": str(result.get('progress_analysis') or ''),
            "recommendations": [str(r) for r in recs if r][:6],
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error en analíticas IA: {str(e)}")
        raise HTTPException(status_code=500, detail="Error conectando con la IA.")

# --- VÍDEOS DE TÉCNICA ---
# Cada vídeo se guarda en su propia colección en cuanto se sube (antes solo se guardaba al terminar la sesión),
# con los comentarios del entrenador (opcionalmente en un segundo concreto del vídeo).
# Los archivos están en Cloudinary. Para borrarlos también de allí, el servidor necesita CLOUDINARY_API_KEY y
# CLOUDINARY_API_SECRET (Cloudinary → Settings → API Keys); sin ellas, el vídeo se quita de la app pero el archivo queda en la nube.
CLOUDINARY_CLOUD_NAME = os.environ.get('CLOUDINARY_CLOUD_NAME', 'slsdfq8t')
CLOUDINARY_API_KEY = os.environ.get('CLOUDINARY_API_KEY')
CLOUDINARY_API_SECRET = os.environ.get('CLOUDINARY_API_SECRET')

class TechniqueVideoCreate(BaseModel):
    url: str
    public_id: Optional[str] = None
    athlete_id: Optional[str] = None
    workout_id: Optional[str] = None
    exercise_name: Optional[str] = ''
    exercise_key: Optional[str] = None

class VideoCommentCreate(BaseModel):
    text: str
    time_s: Optional[float] = None

def cloudinary_public_id(url: str) -> Optional[str]:
    """De https://res.cloudinary.com/<nube>/video/upload/[transformaciones/]v123/carpeta/nombre.mov saca "carpeta/nombre"."""
    prefix = f"https://res.cloudinary.com/{CLOUDINARY_CLOUD_NAME}/video/upload/"
    if not url or not url.startswith(prefix):
        return None
    parts = url[len(prefix):].split('?')[0].split('/')
    versions = [i for i, p in enumerate(parts) if re.fullmatch(r"v\d+", p)]
    if versions:
        parts = parts[versions[0] + 1:]
    public_id = re.sub(r"\.[A-Za-z0-9]+$", "", '/'.join(parts))
    return public_id or None

def delete_cloudinary_video(public_id: Optional[str]) -> bool:
    """Borra el archivo de Cloudinary (llamada firmada). Devuelve False si no hay claves o falla."""
    if not (CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET and public_id):
        return False
    timestamp = int(time.time())
    to_sign = f"invalidate=true&public_id={public_id}&timestamp={timestamp}"
    signature = hashlib.sha1((to_sign + CLOUDINARY_API_SECRET).encode()).hexdigest()
    try:
        res = requests.post(
            f"https://api.cloudinary.com/v1_1/{CLOUDINARY_CLOUD_NAME}/video/destroy",
            data={"public_id": public_id, "timestamp": timestamp, "api_key": CLOUDINARY_API_KEY, "signature": signature, "invalidate": "true"},
            timeout=15,
        )
        result = res.json().get("result")
        if result not in ("ok", "not found"):
            logger.warning(f"Cloudinary no borró {public_id}: {res.text[:200]}")
        return result in ("ok", "not found")
    except Exception as e:
        logger.error(f"Error borrando vídeo en Cloudinary: {e}")
        return False

def _workout_video_items(completion_data: dict):
    """Ejercicios de una sesión completada con su clave: "3" (fuerza) o "1-2" (bloque-ejercicio HIIT)."""
    items = [(str(i), ex) for i, ex in enumerate(completion_data.get('exercise_results') or [])]
    for b, block in enumerate(completion_data.get('hiit_results') or []):
        items += [(f"{b}-{e}", ex) for e, ex in enumerate(block.get('hiit_exercises') or [])]
    return items

async def import_legacy_videos(athlete_id: str):
    """Los vídeos de la versión anterior estaban guardados dentro de cada sesión: se copian a la colección (una sola vez)."""
    workouts = await db.workouts.find({"athlete_id": athlete_id, "completed": True}, {"_id": 0, "id": 1, "title": 1, "date": 1, "completion_data": 1}).to_list(1000)
    known = {v.get('url') for v in await db.technique_videos.find({"athlete_id": athlete_id}, {"_id": 0, "url": 1}).to_list(5000)}
    athlete = await db.users.find_one({"id": athlete_id}, {"_id": 0, "trainer_id": 1}) or {}
    new_docs = []
    for w in workouts:
        for key, ex in _workout_video_items(w.get('completion_data') or {}):
            url = (ex or {}).get('recorded_video_url')
            if not url or url in known:
                continue
            known.add(url)
            created = f"{w.get('date') or datetime.now(timezone.utc).date().isoformat()}T12:00:00+00:00"
            comments = []
            if ex.get('coach_note'):
                comments.append({"id": str(uuid.uuid4()), "text": ex['coach_note'], "time_s": None, "author_id": athlete.get('trainer_id'),
                                 "author_name": "Entrenador", "author_role": "trainer", "created_at": created})
            new_docs.append({
                "id": str(uuid.uuid4()), "athlete_id": athlete_id, "trainer_id": athlete.get('trainer_id'), "uploaded_by": athlete_id,
                "workout_id": w.get('id'), "workout_title": w.get('title', ''), "workout_date": w.get('date', ''),
                "exercise_name": ex.get('name', ''), "exercise_key": key, "url": url, "public_id": cloudinary_public_id(url),
                "comments": comments, "legacy": True, "created_at": created,
            })
    if new_docs:
        await db.technique_videos.insert_many(new_docs)

async def _unlink_video_from_workout(video: dict):
    """Quita el vídeo de la sesión donde se guardó (para que no vuelva a aparecer)."""
    if not video.get('workout_id'):
        return
    workout = await db.workouts.find_one({"id": video['workout_id']}, {"_id": 0, "completion_data": 1})
    cd = (workout or {}).get('completion_data')
    if not cd:
        return
    changed = False
    for _, ex in _workout_video_items(cd):
        if ex.get('recorded_video_url') == video.get('url'):
            ex['recorded_video_url'] = ''
            if video.get('legacy'):
                ex['coach_note'] = ''  # su comentario ya era parte del vídeo
            changed = True
    if changed:
        await db.workouts.update_one({"id": video['workout_id']}, {"$set": {"completion_data": cd}})

async def _remove_video(video: dict) -> bool:
    cloud_deleted = await run_in_threadpool(delete_cloudinary_video, video.get('public_id') or cloudinary_public_id(video.get('url', '')))
    await db.technique_videos.delete_one({"id": video['id']})
    await _unlink_video_from_workout(video)
    return cloud_deleted

async def _get_accessible_video(user: dict, video_id: str) -> dict:
    video = await db.technique_videos.find_one({"id": video_id}, {"_id": 0})
    if not video:
        raise HTTPException(status_code=404, detail="Vídeo no encontrado")
    await ensure_athlete_access(user, video['athlete_id'])
    return video

@api_router.delete("/workouts/{workout_id}/coach-note/{exercise_key}")
async def delete_coach_note(workout_id: str, exercise_key: str, user=Depends(get_current_user)):
    """Borra de verdad una nota del entrenador de un ejercicio (clave "3" en fuerza o "1-2" en HIIT)."""
    workout = await db.workouts.find_one({"id": workout_id}, {"_id": 0, "athlete_id": 1, "completion_data": 1})
    if not workout:
        raise HTTPException(status_code=404, detail="Sesión no encontrada")
    await ensure_athlete_access(user, workout['athlete_id'])
    completion_data = workout.get('completion_data') or {}
    found = False
    for key, ex in _workout_video_items(completion_data):
        if key == exercise_key and isinstance(ex, dict) and ex.get('coach_note'):
            ex['coach_note'] = ''
            found = True
    if not found:
        raise HTTPException(status_code=404, detail="Nota no encontrada")
    await db.workouts.update_one({"id": workout_id}, {"$set": {"completion_data": completion_data}})
    return {"status": "deleted"}

@api_router.get("/videos")
async def list_videos(athlete_id: Optional[str] = None, workout_id: Optional[str] = None, user=Depends(get_current_user)):
    if user['role'] != 'trainer':
        athlete_ids = [user['id']]
    elif athlete_id:
        await ensure_athlete_access(user, athlete_id)
        athlete_ids = [athlete_id]
    else:
        athlete_ids = await accessible_athlete_ids(user)
    for a_id in athlete_ids:
        await import_legacy_videos(a_id)
    query: Dict[str, Any] = {"athlete_id": {"$in": athlete_ids}}
    if workout_id:
        query["workout_id"] = workout_id
    return await db.technique_videos.find(query, {"_id": 0}).sort("created_at", -1).to_list(500)

@api_router.post("/videos")
async def create_video(data: TechniqueVideoCreate, background_tasks: BackgroundTasks, user=Depends(get_current_user)):
    athlete_id = data.athlete_id or user['id']
    athlete = await ensure_athlete_access(user, athlete_id)
    if not data.url.startswith("https://res.cloudinary.com/"):
        raise HTTPException(status_code=400, detail="El vídeo tiene que estar subido a la nube de la app.")
    workout = None
    if data.workout_id:
        workout = await db.workouts.find_one({"id": data.workout_id, "athlete_id": athlete_id}, {"_id": 0, "title": 1, "date": 1})
        if not workout:
            raise HTTPException(status_code=404, detail="Sesión no encontrada")
        # Un vídeo por ejercicio y sesión: si se vuelve a grabar, el nuevo sustituye al anterior
        if data.exercise_key is not None:
            old_videos = await db.technique_videos.find({"athlete_id": athlete_id, "workout_id": data.workout_id, "exercise_key": data.exercise_key}, {"_id": 0}).to_list(20)
            for old in old_videos:
                if old.get('url') != data.url:
                    await _remove_video(old)
    video = {
        "id": str(uuid.uuid4()), "athlete_id": athlete_id, "trainer_id": athlete.get('trainer_id') if user['role'] != 'trainer' else user['id'],
        "uploaded_by": user['id'], "workout_id": data.workout_id, "workout_title": (workout or {}).get('title', ''),
        "workout_date": (workout or {}).get('date', datetime.now(timezone.utc).date().isoformat()),
        "exercise_name": (data.exercise_name or '').strip(), "exercise_key": data.exercise_key,
        "url": data.url, "public_id": data.public_id or cloudinary_public_id(data.url),
        "comments": [], "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.technique_videos.insert_one(video)
    video.pop('_id', None)
    if user['role'] == 'athlete' and user.get('trainer_id'):
        where = f" ({video['workout_title']})" if video.get('workout_title') else ''
        await push_event(background_tasks, user['trainer_id'], "video_uploaded", f"🎥 {user.get('name', 'Tu deportista')} ha subido un vídeo",
                         f"{video['exercise_name'] or 'Vídeo de técnica'}{where}. Pulsa para verlo y corregir.",
                         f"/analytics?tab=feedback&athlete_id={user['id']}", f"video-{video['id']}")
    return video

@api_router.delete("/videos/{video_id}")
async def delete_video(video_id: str, user=Depends(get_current_user)):
    video = await _get_accessible_video(user, video_id)
    cloud_deleted = await _remove_video(video)
    return {"status": "deleted", "cloud_deleted": cloud_deleted}

@api_router.post("/videos/{video_id}/comments")
async def add_video_comment(video_id: str, data: VideoCommentCreate, background_tasks: BackgroundTasks, user=Depends(get_current_user)):
    video = await _get_accessible_video(user, video_id)
    text = (data.text or '').strip()
    if not text:
        raise HTTPException(status_code=400, detail="Escribe el comentario.")
    comment = {
        "id": str(uuid.uuid4()), "text": text[:2000],
        "time_s": round(max(0.0, float(data.time_s)), 1) if data.time_s is not None else None,
        "author_id": user['id'], "author_name": user.get('name', ''), "author_role": user['role'],
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.technique_videos.update_one({"id": video_id}, {"$push": {"comments": comment}})
    exercise = video.get('exercise_name') or 'técnica'
    if user['role'] == 'trainer':
        await push_event(background_tasks, video['athlete_id'], "coach_feedback", f"🎥 Corrección en tu vídeo de {exercise}",
                         text, "/analytics?tab=feedback", f"video-{video_id}")
    elif user.get('trainer_id'):
        await push_event(background_tasks, user['trainer_id'], "video_uploaded", f"💬 {user.get('name', 'Tu deportista')} ha comentado su vídeo",
                         f"{exercise}: {text}", f"/analytics?tab=feedback&athlete_id={user['id']}", f"video-{video_id}")
    return comment

@api_router.delete("/videos/{video_id}/comments/{comment_id}")
async def delete_video_comment(video_id: str, comment_id: str, user=Depends(get_current_user)):
    video = await _get_accessible_video(user, video_id)
    comment = next((c for c in video.get('comments', []) if c.get('id') == comment_id), None)
    if not comment:
        raise HTTPException(status_code=404, detail="Comentario no encontrado")
    if comment.get('author_id') != user['id'] and user['role'] != 'trainer':
        raise HTTPException(status_code=403, detail="Solo puedes borrar tus comentarios")
    await db.technique_videos.update_one({"id": video_id}, {"$pull": {"comments": {"id": comment_id}}})
    return {"status": "deleted"}

# --- RUTAS DE WELLNESS ---
@api_router.get("/wellness/history/{athlete_id}")
async def get_wellness_history(athlete_id: str, user=Depends(get_current_user)):
    await ensure_athlete_access(user, athlete_id)
    history = await db.wellness.find({"athlete_id": athlete_id}, {"_id": 0}).sort("date", -1).to_list(7)
    return history[::-1]

@api_router.post("/wellness")
async def create_wellness(data: WellnessCreate, background_tasks: BackgroundTasks, user=Depends(get_current_user)):
    target_date = data.date if data.date else datetime.now(timezone.utc).isoformat().split('T')[0]
    
    target_athlete_id = data.athlete_id if (data.athlete_id and user['role'] == 'trainer') else user['id']
    await ensure_athlete_access(user, target_athlete_id)
    
    wellness_data = {
        "fatigue": data.fatigue, 
        "stress": data.stress, 
        "sleep_quality": data.sleep_quality,
        "soreness": data.soreness, 
        "notes": data.notes, 
        "cycle_phase": data.cycle_phase,
        "discomforts": data.discomforts,  # Añadido
        "sleep_hours": data.sleep_hours,  # Añadido
        "updated_at": datetime.now(timezone.utc).isoformat()
    }
    
    existing = await db.wellness.find_one({"athlete_id": target_athlete_id, "date": target_date})
    if existing:
        await db.wellness.update_one({"_id": existing["_id"]}, {"$set": wellness_data})
    else:
        wellness_data.update({"id": str(uuid.uuid4()), "athlete_id": target_athlete_id, "date": target_date, "created_at": wellness_data["updated_at"]})
        await db.wellness.insert_one(wellness_data)

    # 🤖 AGENTE FISIO: Intervención Automática
    # if data.fatigue >= 4 or data.soreness >= 4:
    #    recovery_workout = {
    #        "id": str(uuid.uuid4()),
    #        "title": "🆘 PROTOCOLO RESET: Fluidez y Recuperación",
    #        "date": target_date,
    #        "athlete_id": target_athlete_id,
    #        "exercises": [
    #            {"name": "Liberación Miofascial (Foam Roller)", "sets": 1, "reps": "5 min", "notes": "Cadenas posteriores y cuádriceps. Buscar puntos de tensión sin dolor extremo."},
    #            {"name": "Movilidad 90/90 de Cadera", "sets": 2, "reps": "10/lado", "notes": "Sin forzar. El objetivo es engrasar la articulación y recuperar rango."},
    #            {"name": "Gato-Camello + Rotaciones Torácicas", "sets": 2, "reps": "8 reps", "notes": "Conectar con la respiración. Darle espacio a la columna."},
    #            {"name": "Box Breathing (Respiración 4-4-4-4)", "sets": 1, "reps": "3 min", "notes": "Resetear el Sistema Nervioso Central (SNC) para bajar los niveles de cortisol."}
    #        ],
    #        "notes": "🤖 AGENTE FISIO: He detectado niveles altos de fatiga muscular. He inyectado esta sesión para priorizar la recuperación, reducir el riesgo de lesión y restaurar tus cimientos.",
    #        "completed": False,
    #        "is_ai": True
    #    }
    #    await db.workouts.insert_one(recovery_workout)

   # Notificaciones por Email a Andre/Entrenador
    if user.get('role') == 'athlete' and user.get('trainer_id'):
        trainer = await db.users.find_one({"id": user['trainer_id']})
        # Verificamos si tiene los emails activados (por defecto asumimos que Sí)
        if trainer and trainer.get('email_notifications', True) is not False:
            athlete_name = html.escape(user.get('name', 'Un deportista'))
            
            titulo = f"📊 {athlete_name} ha actualizado su Wellness"
            mensaje_html = f"""
            <h3>Actualización de estado</h3>
            <p><b>{athlete_name}</b> acaba de registrar sus sensaciones de hoy:</p>
            <ul>
                <li><b>Fatiga:</b> {data.fatigue} / 5</li>
                <li><b>Agujetas/Dolor:</b> {data.soreness} / 5</li>
                <li><b>Estrés:</b> {data.stress} / 5</li>
                <li><b>Calidad de Sueño:</b> {data.sleep_quality} / 5</li>
            </ul>
            """
            
        # Si hay alerta, cambiamos el asunto y añadimos el aviso al cuerpo
            if data.fatigue >= 4 or data.soreness >= 4:
                titulo = f"⚠️ ATENCIÓN: Niveles altos de fatiga en {athlete_name}"
                mensaje_html += "<br><p style='color: orange;'><b>⚠️ Atención:</b> El atleta ha reportado niveles altos de fatiga o dolor. Se recomienda revisar su estado y, si es necesario, inyectar una píldora de recuperación desde su perfil.</p>"
                    
            if data.notes:
                mensaje_html += f"<p><b>Notas del atleta:</b> {html.escape(data.notes)}</p>"
                
            await notify(background_tasks, send_email_async, trainer['email'], titulo, mensaje_html)

    if user.get('role') == 'athlete' and user.get('trainer_id'):
        # Valores marcados con ⚠️ cuando son preocupantes (mismos umbrales que el aviso por WhatsApp)
        values = [("Fatiga", data.fatigue, data.fatigue >= 4), ("Dolor", data.soreness, data.soreness >= 4),
                  ("Estrés", data.stress, data.stress >= 4), ("Sueño", data.sleep_quality, data.sleep_quality <= 2)]
        parts = [f"{label} {v}/5{' ⚠️' if bad else ''}" for label, v, bad in values]
        molestias = [f"{zona}{' (fuerte)' if nivel == 'fuerte' else ''}" for zona, nivel in (data.discomforts or {}).items()]
        if molestias: parts.append("Molestias: " + ", ".join(molestias))
        if data.notes: parts.append(f"«{data.notes[:120]}»")
        alerts = any(bad for *_, bad in values) or bool(molestias)
        resumen = " · ".join(parts)
        name = user.get('name', 'Tu deportista')
        target = await db.users.find_one({"id": user['trainer_id']}, {"_id": 0, "role": 1, "push_prefs": 1})
        if target:
            url, tag = athlete_url(user), f"wellness-{user['id']}"
            if alerts and push_pref_enabled(target, "wellness_alert"):
                await push_event(background_tasks, user['trainer_id'], "wellness_alert", f"⚠️ Alerta de bienestar: {name}", resumen, url, tag)
            elif push_pref_enabled(target, "wellness_submitted"):
                await push_event(background_tasks, user['trainer_id'], "wellness_submitted", f"📊 {name} ha rellenado el bienestar", resumen, url, tag)
    return {"status": "success"}

@api_router.get("/analytics/summary")
async def analytics_summary(athlete_id: Optional[str] = None, user=Depends(get_current_user)):
    target_id = athlete_id if (user['role'] == 'trainer' and athlete_id) else user['id']
    target_user = await ensure_athlete_access(user, target_id)
    total = await db.workouts.count_documents({"athlete_id": target_id})
    completed = await db.workouts.count_documents({"athlete_id": target_id, "completed": True})
    latest_well = await db.wellness.find_one({"athlete_id": target_id}, {"_id": 0}, sort=[("date", -1), ("updated_at", -1)])
    return {
        "total_workouts": total, "completed_workouts": completed,
        "latest_wellness": latest_well or {"fatigue": 0, "stress": 0, "sleep_quality": 0, "soreness": 0, "notes": "", "cycle_phase": ""},
        "completion_rate": round((completed / total * 100) if total > 0 else 0, 1),
        "is_injured": target_user.get("is_injured", False) if target_user else False,
        "injury_notes": target_user.get("injury_notes", "") if target_user else "",
        "equipment": target_user.get("equipment", "") if target_user else ""
    }

# --- RUTAS DE USUARIOS Y AUTENTICACIÓN ---
@api_router.post("/auth/register")
async def register(data: UserRegister):
    if not trainer_signup_allowed(data.email):
        raise HTTPException(status_code=403, detail="El registro está cerrado. Pide acceso a tu entrenador o al administrador.")
    validate_password(data.password)
    existing = await db.users.find_one({"email": data.email})
    if existing: raise HTTPException(status_code=400, detail="Email ya registrado")
    user_id = str(uuid.uuid4())
    user = {"id": user_id, "email": data.email, "password": hash_password(data.password), "name": data.name, "role": "trainer", "created_at": datetime.now(timezone.utc).isoformat()}
    await db.users.insert_one(user)
    return {"token": create_token(user_id, "trainer"), "user": {k: v for k, v in user.items() if k not in ('password', '_id')}}

@api_router.post("/auth/login")
async def login(data: UserLogin):
    attempts_key = f"login:{data.email.strip().lower()}"
    if await too_many_attempts(attempts_key, LOGIN_MAX_FAILURES, LOGIN_WINDOW_SECONDS):
        raise HTTPException(status_code=429, detail="Demasiados intentos fallidos. Espera 15 minutos y vuelve a probar.")
    user = await db.users.find_one({"email": data.email})
    if not user or not verify_password(data.password, user.get('password')):
        await record_attempt(attempts_key)
        raise HTTPException(status_code=401, detail="Email o contraseña incorrectos")
    await clear_attempts(attempts_key)
    return {"token": create_token(user['id'], user['role']), "user": {k: v for k, v in user.items() if k not in ('_id', 'password')}}

@api_router.post("/auth/google")
async def google_login(data: GoogleAuth):
    try:
        import google.auth.transport.requests as google_requests
        from google.oauth2 import id_token
        
        id_info = id_token.verify_oauth2_token(data.token, google_requests.Request(), audience=None)
        
        if id_info.get('aud') not in GOOGLE_ALLOWED_AUDIENCES:
            raise HTTPException(status_code=401, detail="El token no pertenece a esta aplicación")

        email = id_info.get('email')
        if not email: raise HTTPException(status_code=400, detail="Token de Google no contiene email")
        
        user = await db.users.find_one({"email": email})
        if not user:
            # El rol nunca se toma del cliente: solo se crean entrenadores autorizados.
            if not trainer_signup_allowed(email): raise HTTPException(status_code=403, detail="Sin invitación activa.")
            user_id = str(uuid.uuid4())
            user = {"id": user_id, "email": email, "password": hash_password(str(uuid.uuid4())), "name": id_info.get('name', 'Usuario'), "role": "trainer", "created_at": datetime.now(timezone.utc).isoformat()}
            await db.users.insert_one(user)
            
        return {"token": create_token(user['id'], user['role']), "user": {k: v for k, v in user.items() if k not in ('_id', 'password')}}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error Google Login: {str(e)}")
        raise HTTPException(status_code=401, detail="Token de Google inválido")

@api_router.get("/auth/me")
async def get_me(user=Depends(get_current_user)):
    return {"user": {k: v for k, v in user.items() if k not in ('_id', 'password')}}

@api_router.put("/profile")
async def update_profile(data: ProfileUpdate, background_tasks: BackgroundTasks, user=Depends(get_current_user)):
    update_data = {k: v for k, v in data.dict().items() if v is not None}
    await db.users.update_one({"id": user['id']}, {"$set": update_data})
    if user['role'] == 'athlete' and user.get('trainer_id') and update_data.get('is_injured') is True and not user.get('is_injured'):
        notes = (update_data.get('injury_notes') or user.get('injury_notes') or '').strip()
        await push_event(background_tasks, user['trainer_id'], "wellness_alert", f"🩹 {user.get('name', 'Tu deportista')} ha marcado una lesión",
                         notes[:200] or "Revisa su perfil y ajusta las próximas sesiones.", athlete_url(user), f"injury-{user['id']}")
    return {"status": "success"}

# --- GESTIÓN DE ATLETAS ---
@api_router.get("/athletes")
async def list_athletes(user=Depends(get_current_user)):
    if user['role'] == 'trainer': return await db.users.find({"trainer_id": user['id'], "role": "athlete"}, {"_id": 0, "password": 0}).to_list(1000)
    return []

@api_router.get("/athletes/{athlete_id}")
async def get_athlete(athlete_id: str, user=Depends(get_current_user)):
    return await ensure_athlete_access(user, athlete_id)

@api_router.post("/athletes")
async def create_athlete(data: AthleteCreate, user=Depends(get_current_user)):
    if user['role'] != 'trainer': raise HTTPException(status_code=403, detail="No autorizado")
    if await db.users.find_one({"email": data.email}): raise HTTPException(status_code=400, detail="Email ya registrado")
    validate_password(data.password)
    athlete_id = str(uuid.uuid4())
    await db.users.insert_one({"id": athlete_id, "email": data.email, "password": hash_password(data.password), "name": data.name, "gender": data.gender, "role": "athlete", "sport": data.sport, "phone": data.phone, "trainer_id": user['id'], "created_at": datetime.now(timezone.utc).isoformat()})
    return {"status": "success", "id": athlete_id}

@api_router.put("/athletes/{athlete_id}")
async def update_athlete(athlete_id: str, data: AthleteUpdate, user=Depends(get_current_user)):
    athlete = await ensure_own_athlete(user, athlete_id)
    if data.email and data.email != athlete.get('email') and await db.users.find_one({"email": data.email}):
        raise HTTPException(status_code=400, detail="Email ya registrado")
    update_data = {k: v for k, v in data.dict().items() if v is not None}
    # Contraseña vacía = no cambiarla (el formulario de edición la envía vacía)
    update_data.pop("password", None)
    if data.password:
        validate_password(data.password)
        update_data["password"] = hash_password(data.password)
    await db.users.update_one({"id": athlete_id}, {"$set": update_data})
    return {"status": "success"}

@api_router.patch("/athletes/{athlete_id}/cycles")
async def update_athlete_cycles(athlete_id: str, cycles: CycleUpdate, user=Depends(get_current_user)):
    await ensure_own_athlete(user, athlete_id)
    await db.users.update_one(
        {"id": athlete_id}, 
        {"$set": {"macro_ciclo": cycles.macro_ciclo, "micro_ciclo": cycles.micro_ciclo}}
    )
    return {"message": "Ciclos actualizados correctamente", "macro": cycles.macro_ciclo, "micro": cycles.micro_ciclo}

@api_router.delete("/athletes/{athlete_id}")
async def delete_athlete(athlete_id: str, user=Depends(get_current_user)):
    await ensure_own_athlete(user, athlete_id)
    macros = await db.macrociclos.find({"athlete_id": athlete_id}, {"_id": 0, "id": 1}).to_list(1000)
    await db.users.delete_one({"id": athlete_id})
    await db.push_subscriptions.delete_many({"user_id": athlete_id})
    for r in await db.problem_reports.find({"user_id": athlete_id}, {"_id": 0, "id": 1}).to_list(1000):
        await db.problem_report_images.delete_one({"report_id": r["id"]})
    await db.problem_reports.delete_many({"user_id": athlete_id})
    await db.workouts.delete_many({"athlete_id": athlete_id})
    await db.wellness.delete_many({"athlete_id": athlete_id})
    await db.tests.delete_many({"athlete_id": athlete_id})
    for video in await db.technique_videos.find({"athlete_id": athlete_id}, {"_id": 0}).to_list(1000):
        await run_in_threadpool(delete_cloudinary_video, video.get('public_id'))
    await db.technique_videos.delete_many({"athlete_id": athlete_id})
    await db.microciclos.delete_many({"macrociclo_id": {"$in": [m.get('id') for m in macros]}})
    await db.macrociclos.delete_many({"athlete_id": athlete_id})
    return {"status": "success"}

# --- ENTRENAMIENTOS E INTERCEPTOR ML ---
@api_router.post("/workouts")
async def create_workout(data: WorkoutCreate, background_tasks: BackgroundTasks, user=Depends(get_current_user)):
    await ensure_athlete_access(user, data.athlete_id)
    if data.microciclo_id: await ensure_micro_access(user, data.microciclo_id)
    workout = data.dict()
    is_ai = workout.pop("is_ai", False)
    workout.update({"id": str(uuid.uuid4()), "completed": False, "completion_data": None})
    
    await db.workouts.insert_one(workout)
    
    # 🔥 MACHINE LEARNING
    if not is_ai and user['role'] == 'trainer':
        await db.brain_memory.insert_one({
            "id": str(uuid.uuid4()),
            "trainer_id": user['id'],
            "title": data.title,
            "exercises": data.exercises,
            "notes": data.notes,
            "learned_at": datetime.now(timezone.utc).isoformat()
        })
    
    workout.pop('_id', None)
    
    if user['role'] == 'trainer':
        athlete = await db.users.find_one({"id": data.athlete_id})
        if athlete and athlete.get('email_notifications', True) is not False:
            trainer_name = html.escape(user.get('name', 'Tu entrenador'))
            titulo = "🏋️‍♂️ ¡Nueva sesión en tu calendario!"
            mensaje_html = f"<p>Hola {html.escape(athlete.get('name', ''))},</p><p><b>{trainer_name}</b> acaba de programarte la sesión <b>'{html.escape(data.title)}'</b> para el día {html.escape(data.date)}.</p><p>Abre la app para ver los detalles.</p>"
            await notify(background_tasks, send_email_async, athlete['email'], titulo, mensaje_html)
        kind = "batería de tests" if data.is_test_battery else "sesión"
        await push_event(background_tasks, data.athlete_id, "workout_assigned", f"🏋️ Nueva {kind}: {data.title}",
                         f"{user.get('name', 'Tu entrenador')} te la ha programado para {fecha_amable(data.date)}.", "/home", "new-workouts")

    return workout

@api_router.post("/workouts/bulk")
async def create_workouts_bulk(data: WorkoutBulkCreate, background_tasks: BackgroundTasks, user=Depends(get_current_user)):
    new_workouts, athlete_ids, brain_memories = [], set(), []

    for a_id in {w.athlete_id for w in data.workouts}:
        await ensure_athlete_access(user, a_id)
    for m_id in {w.microciclo_id for w in data.workouts if w.microciclo_id}:
        await ensure_micro_access(user, m_id)
    
    for w in data.workouts:
        workout = w.dict()
        is_ai = workout.pop("is_ai", False)
        workout.update({"id": str(uuid.uuid4()), "completed": False, "completion_data": None})
        new_workouts.append(workout)
        athlete_ids.add(w.athlete_id)
        
        if not is_ai and user['role'] == 'trainer':
            brain_memories.append({
                "id": str(uuid.uuid4()),
                "trainer_id": user['id'],
                "title": w.title,
                "exercises": w.exercises,
                "notes": w.notes,
                "learned_at": datetime.now(timezone.utc).isoformat()
            })

    if new_workouts:
        await db.workouts.insert_many(new_workouts)
        if brain_memories:
            await db.brain_memory.insert_many(brain_memories) 
            
        if user['role'] == 'trainer':
            trainer_name = html.escape(user.get('name', 'Tu entrenador'))
            for a_id in athlete_ids:
                athlete = await db.users.find_one({"id": a_id})
                if athlete and athlete.get('email_notifications', True) is not False:
                    count = sum(1 for wk in data.workouts if wk.athlete_id == a_id)
                    titulo = "📅 Tu calendario ha sido actualizado"
                    mensaje_html = f"<p>Hola {html.escape(athlete.get('name', ''))},</p><p><b>{trainer_name}</b> ha añadido <b>{count} nuevas sesiones</b> a tu planificación.</p><p>Abre la app para revisar las próximas fechas.</p>"
                    await notify(background_tasks, send_email_async, athlete['email'], titulo, mensaje_html)
            for a_id in athlete_ids:
                mine = sorted((wk for wk in data.workouts if wk.athlete_id == a_id), key=lambda wk: wk.date)
                if len(mine) == 1:
                    title, body = f"🏋️ Nueva sesión: {mine[0].title}", f"{user.get('name', 'Tu entrenador')} te la ha programado para {fecha_amable(mine[0].date)}."
                else:
                    title, body = f"📅 Tienes {len(mine)} sesiones nuevas", f"La primera es {fecha_amable(mine[0].date)}: {mine[0].title}."
                await push_event(background_tasks, a_id, "workout_assigned", title, body, "/home", "new-workouts")

    return {"status": "success", "inserted": len(new_workouts)}

@api_router.get("/workouts")
async def list_workouts(athlete_id: Optional[str] = None, date: Optional[str] = None, user=Depends(get_current_user)):
    if user['role'] == 'athlete':
        query = {'athlete_id': user['id']}
    elif athlete_id:
        await ensure_athlete_access(user, athlete_id)
        query = {'athlete_id': athlete_id}
    else:
        query = {'athlete_id': {'$in': await accessible_athlete_ids(user)}}
    if date: query['date'] = date
    return await db.workouts.find(query, {"_id": 0}).sort("date", -1).to_list(1000)

def _coach_notes(cd) -> dict:
    """Notas del entrenador en una sesión hecha: {'2': ('Sentadilla', 'Baja más'), '0-1': (...)}."""
    out = {}
    if not isinstance(cd, dict):
        return out
    for i, ex in enumerate(cd.get('exercise_results') or []):
        if isinstance(ex, dict) and str(ex.get('coach_note') or '').strip():
            out[str(i)] = (ex.get('name') or 'Ejercicio', str(ex['coach_note']).strip())
    for b, blk in enumerate(cd.get('hiit_results') or []):
        for e, ex in enumerate((blk or {}).get('hiit_exercises') or [] if isinstance(blk, dict) else []):
            if isinstance(ex, dict) and str(ex.get('coach_note') or '').strip():
                out[f"{b}-{e}"] = (ex.get('name') or 'Ejercicio', str(ex['coach_note']).strip())
    return out

async def notify_workout_update(background_tasks: BackgroundTasks, user: dict, existing: dict, update: dict):
    """Avisos al guardar una sesión: la deportista la termina o la salta (→ entrenador), o el entrenador la cambia,
    la mueve de día o deja notas en los ejercicios (→ deportista)."""
    wid = existing.get('id')
    title = update.get('title') or existing.get('title') or 'Sesión'
    if user['role'] == 'athlete':
        if not user.get('trainer_id') or update.get('completed') is not True or existing.get('completed'):
            return
        name = user.get('name', 'Tu deportista')
        obs = (update.get('observations') if 'observations' in update else existing.get('observations')) or ''
        if '[NO COMPLETADA]' in obs:
            motivo = obs.replace('[NO COMPLETADA] Motivo:', '').replace('[NO COMPLETADA]', '').strip()
            await push_event(background_tasks, user['trainer_id'], "workout_skipped", f"⏭️ {name} no ha hecho «{title}»",
                             f"Motivo: {motivo}" if motivo else "No ha indicado el motivo.", athlete_url(user), f"workout-{wid}")
            return
        cd = update.get('completion_data') if isinstance(update.get('completion_data'), dict) else {}
        details = []
        if cd.get('rpe') not in (None, '', 0):
            details.append(f"RPE {cd['rpe']}/10")
        if cd.get('duration_seconds'):
            details.append(f"{max(1, round(float(cd['duration_seconds']) / 60))} min")
        if cd.get('sore_joints'):
            details.append("ha marcado molestias")
        if obs.strip():
            details.append(f"«{obs.strip()[:120]}»")
        await push_event(background_tasks, user['trainer_id'], "workout_completed", f"✅ {name} ha terminado «{title}»",
                         " · ".join(details) or "Pulsa para ver cómo le ha ido.", athlete_url(user), f"workout-{wid}")
        return

    if user['role'] != 'trainer':
        return
    athlete_id = existing.get('athlete_id')
    if 'completion_data' in update:
        old = _coach_notes(existing.get('completion_data'))
        changed = [v for k, v in _coach_notes(update.get('completion_data')).items() if old.get(k, ('', ''))[1] != v[1]]
        if changed:
            exercise, note = changed[0]
            more = f" (y {len(changed) - 1} más)" if len(changed) > 1 else ""
            await push_event(background_tasks, athlete_id, "coach_feedback", f"📝 Nota de tu entrenador: {exercise}{more}",
                             note, "/analytics?tab=feedback", f"notes-{wid}")
    if existing.get('completed') or update.get('completed'):
        return
    old_date = existing.get('date') or ''
    new_date = update.get('date') or old_date
    if max(old_date, new_date) < local_today():
        return
    if new_date != old_date:
        await push_event(background_tasks, athlete_id, "workout_changed", f"📅 Sesión movida: {title}",
                         f"Ahora es {fecha_amable(new_date)} (antes, {fecha_amable(old_date)}).", "/home", f"workout-{wid}")
    elif any(k in update and (update[k] or '') != (existing.get(k) or '') for k in ('exercises', 'title', 'notes')):
        await push_event(background_tasks, athlete_id, "workout_changed", f"✏️ Cambios en tu sesión: {title}",
                         f"Tu entrenador la ha actualizado. Es {fecha_amable(new_date)}.", "/home", f"workout-{wid}")

@api_router.put("/workouts/{workout_id}")
async def update_workout(workout_id: str, data: WorkoutUpdate, background_tasks: BackgroundTasks, user=Depends(get_current_user)):
    existing = await ensure_workout_access(user, workout_id)
    update_data = data.dict(exclude_unset=True)
    if update_data.get('athlete_id'): await ensure_athlete_access(user, update_data['athlete_id'])
    if update_data.get('microciclo_id'): await ensure_micro_access(user, update_data['microciclo_id'])
    update_data.pop("is_ai", None) 
    await db.workouts.update_one({"id": workout_id}, {"$set": update_data})
    await notify_workout_update(background_tasks, user, existing, update_data)
    return {"status": "success"}

@api_router.delete("/workouts/{workout_id}")
async def delete_workout(workout_id: str, background_tasks: BackgroundTasks, user=Depends(get_current_user)):
    existing = await ensure_workout_access(user, workout_id)
    await db.workouts.delete_one({"id": workout_id})
    if user['role'] == 'trainer' and not existing.get('completed') and (existing.get('date') or '') >= local_today():
        await push_event(background_tasks, existing.get('athlete_id'), "workout_changed", f"🗑️ Sesión eliminada: {existing.get('title', '')}",
                         f"Tu entrenador ha quitado la sesión de {fecha_amable(existing.get('date', ''))}.", "/home", f"workout-{workout_id}")
    return {"status": "success"}

# --- PERIODIZACIÓN (Simplified Tree) ---
@api_router.get("/periodization/tree/{athlete_id}")
async def get_periodization_tree(athlete_id: str, user=Depends(get_current_user)):
    await ensure_athlete_access(user, athlete_id)
    try:
        macros = await db.macrociclos.find({"athlete_id": athlete_id}).to_list(100)
        for m in macros:
            m["id"] = m.get("id", str(m.get("_id")))
            m.pop('_id', None)
            
            m["microciclos"] = await db.microciclos.find({"macrociclo_id": m["id"]}).to_list(100)
            for mic in m["microciclos"]:
                mic["id"] = mic.get("id", str(mic.get("_id")))
                mic.pop('_id', None)
                
                mic["workouts"] = await db.workouts.find({"microciclo_id": mic["id"]}).to_list(100)
                for w in mic["workouts"]: 
                    w["id"] = w.get("id", str(w.get("_id")))
                    w.pop('_id', None)
                    
        unassigned = await db.workouts.find({"athlete_id": athlete_id, "microciclo_id": {"$in": [None, ""]}}).to_list(100)
        for u in unassigned: 
            u["id"] = u.get("id", str(u.get("_id")))
            u.pop('_id', None)
            
        return {"macros": macros, "unassigned_workouts": unassigned}
    except Exception as e:
        logger.error(f"Error cargando periodización: {str(e)}")
        return {"macros": [], "unassigned_workouts": [], "error": "No se pudo cargar la periodización"}

@api_router.post("/macrociclos")
async def create_macro(data: MacroCreate, user=Depends(get_current_user)):
    await ensure_athlete_access(user, data.athlete_id)
    macro = data.dict()
    macro["id"] = str(uuid.uuid4())
    await db.macrociclos.insert_one(macro)
    macro.pop('_id', None)
    return {"status": "success", "macro": macro}

@api_router.put("/macrociclos/{macro_id}")
async def update_macro(macro_id: str, data: Dict[str, Any], user=Depends(get_current_user)):
    if user['role'] != 'trainer': raise HTTPException(status_code=403, detail="No autorizado")
    await ensure_macro_access(user, macro_id)
    update_data = {k: v for k, v in data.items() if k not in ('id', '_id', 'athlete_id')}
    await db.macrociclos.update_one({"id": macro_id}, {"$set": update_data})
    return {"status": "success"}

@api_router.delete("/macrociclos/{macro_id}")
async def delete_macro(macro_id: str, user=Depends(get_current_user)):
    if user['role'] != 'trainer': raise HTTPException(status_code=403, detail="No autorizado")
    await ensure_macro_access(user, macro_id)
    await db.macrociclos.delete_one({"id": macro_id})
    
    micros = await db.microciclos.find({"macrociclo_id": macro_id}).to_list(100)
    micro_ids = [m["id"] for m in micros]
    await db.microciclos.delete_many({"macrociclo_id": macro_id})
    
    if micro_ids:
        await db.workouts.update_many({"microciclo_id": {"$in": micro_ids}}, {"$set": {"microciclo_id": None}})
    return {"status": "success"}

@api_router.post("/microciclos")
async def create_micro(data: MicroCreate, user=Depends(get_current_user)):
    await ensure_macro_access(user, data.macrociclo_id)
    micro = data.dict()
    micro["id"] = str(uuid.uuid4())
    await db.microciclos.insert_one(micro)
    micro.pop('_id', None)
    return {"status": "success", "micro": micro}

@api_router.put("/microciclos/{micro_id}")
async def update_micro(micro_id: str, data: Dict[str, Any], user=Depends(get_current_user)):
    if user['role'] != 'trainer': raise HTTPException(status_code=403, detail="No autorizado")
    await ensure_micro_access(user, micro_id)
    update_data = {k: v for k, v in data.items() if k not in ('id', '_id', 'macrociclo_id')}
    await db.microciclos.update_one({"id": micro_id}, {"$set": update_data})
    return {"status": "success"}

@api_router.delete("/microciclos/{micro_id}")
async def delete_micro(micro_id: str, user=Depends(get_current_user)):
    if user['role'] != 'trainer': raise HTTPException(status_code=403, detail="No autorizado")
    await ensure_micro_access(user, micro_id)
    await db.microciclos.delete_one({"id": micro_id})
    
    await db.workouts.update_many({"microciclo_id": micro_id}, {"$set": {"microciclo_id": None}})
    return {"status": "success"}

# --- TESTS FÍSICOS ---
@api_router.post("/tests")
async def create_test(data: TestCreate, background_tasks: BackgroundTasks, user=Depends(get_current_user)):
    await ensure_athlete_access(user, data.athlete_id)
    test_doc = data.dict()
    test_doc.update({"id": str(uuid.uuid4()), "created_at": datetime.now(timezone.utc).isoformat()})
    await db.tests.insert_one(test_doc)
    test_doc.pop('_id', None)
    
    if user.get('role') == 'athlete' and user.get('trainer_id'):
        nombre_test = data.custom_name or data.test_name
        if data.value is not None:
            valor = f"{data.value:g} {data.unit}"
        else:
            valor = " / ".join(f"{lado} {v:g}" for lado, v in (("I", data.value_left), ("D", data.value_right)) if v is not None) + f" {data.unit}"
        await push_event(background_tasks, user['trainer_id'], "test_recorded", f"📏 {user.get('name', 'Tu deportista')}: nuevo registro",
                         f"{nombre_test}: {valor.strip()}", f"/analytics?athlete_id={user['id']}", f"test-{user['id']}")
    return {"status": "success", "test": test_doc}

@api_router.get("/tests")
async def get_tests(athlete_id: Optional[str] = None, test_type: Optional[str] = None, user=Depends(get_current_user)):
    if user['role'] == 'athlete':
        query = {'athlete_id': user['id']}
    elif athlete_id:
        await ensure_athlete_access(user, athlete_id)
        query = {'athlete_id': athlete_id}
    else:
        query = {'athlete_id': {'$in': await accessible_athlete_ids(user)}}
    if test_type and test_type != 'all': query['test_type'] = test_type
    return await db.tests.find(query, {"_id": 0}).sort("date", -1).to_list(1000)

@api_router.put("/tests/{test_id}")
async def update_test(test_id: str, data: TestUpdate, user=Depends(get_current_user)):
    test = await db.tests.find_one({"id": test_id}, {"_id": 0})
    if not test: raise HTTPException(status_code=404, detail="Test no encontrado")
    await ensure_athlete_access(user, test.get('athlete_id'))
    update_data = data.dict(exclude_unset=True)
    await db.tests.update_one({"id": test_id}, {"$set": update_data})
    return {"status": "success", "test": {**test, **update_data}}

@api_router.delete("/tests/{test_id}")
async def delete_test(test_id: str, user=Depends(get_current_user)):
    test = await db.tests.find_one({"id": test_id}, {"_id": 0})
    if not test: raise HTTPException(status_code=404, detail="Test no encontrado")
    await ensure_athlete_access(user, test.get('athlete_id'))
    await db.tests.delete_one({"id": test_id})
    return {"status": "success"}

@api_router.get("/analytics/monthly-summary/{athlete_id}")
async def get_monthly_summary(athlete_id: str, user=Depends(get_current_user)):
    if user['role'] != 'trainer':
        raise HTTPException(status_code=403, detail="Solo Andre puede generar informes")
    
    now = datetime.now(timezone.utc)
    start_date = (now - timedelta(days=30)).isoformat().split('T')[0]

    athlete = await ensure_own_athlete(user, athlete_id)

    workouts = await db.workouts.find({
        "athlete_id": athlete_id,
        "date": {"$gte": start_date},
        "completed": True
    }).to_list(100)

    wellness_logs = await db.wellness.find({
        "athlete_id": athlete_id,
        "date": {"$gte": start_date}
    }).to_list(100)

    avg_fatigue = sum(w.get('fatigue', 0) for w in wellness_logs) / len(wellness_logs) if wellness_logs else 0
    
    tests = await db.tests.find({"athlete_id": athlete_id}).sort("date", -1).to_list(3)

    meses = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"]
    nombre_mes = meses[now.month - 1]

    return {
        "athlete_name": athlete.get("name", "Atleta"),
        "phone": athlete.get("phone", ""),
        "total_completed": len(workouts),
        "avg_fatigue": round(avg_fatigue, 1),
        "recent_tests": [{"name": t.get('test_name'), "val": t.get('value'), "unit": t.get('unit')} for t in tests],
        "month_name": nombre_mes
    }

app.include_router(api_router)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_credentials=True, allow_methods=["*"], allow_headers=["*"])

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", 10000)))
