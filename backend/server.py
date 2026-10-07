import requests
from fastapi import FastAPI, APIRouter, HTTPException, Depends, Header, Request, BackgroundTasks
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.responses import Response
from fastapi.staticfiles import StaticFiles
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
import html
import google.generativeai as genai
from google.api_core.exceptions import ResourceExhausted
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
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# --- CONFIGURACIÓN GEMINI IA ---
GEMINI_API_KEY = os.environ.get('GEMINI_API_KEY')
if GEMINI_API_KEY:
    genai.configure(api_key=GEMINI_API_KEY)
else:
    logger.warning("No se ha encontrado GEMINI_API_KEY en el entorno. El chat de IA no funcionará.")

# Variable global para el Cortocircuito del modelo Pro
COOLDOWN_PRO_UNTIL = 0

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

# --- CONFIGURACIÓN CARPETA DE VÍDEOS ---
UPLOAD_DIR = ROOT_DIR / "uploads"
UPLOAD_DIR.mkdir(exist_ok=True)
app.mount("/uploads", StaticFiles(directory=str(UPLOAD_DIR)), name="uploads")

# --- LIMPIEZA AUTOMÁTICA DE VÍDEOS (30 DÍAS) ---
async def cleanup_old_videos():
    while True:
        try:
            now = time.time()
            thirty_days_seconds = 30 * 24 * 60 * 60  
            if UPLOAD_DIR.exists():
                for file_path in UPLOAD_DIR.iterdir():
                    if file_path.is_file():
                        file_age = now - file_path.stat().st_mtime
                        if file_age > thirty_days_seconds:
                            file_path.unlink() 
                            logger.info(f"Vídeo antiguo eliminado: {file_path.name}")
        except Exception as e:
            logger.error(f"Error en la limpieza: {str(e)}")
        await asyncio.sleep(86400)

@app.on_event("startup")
async def start_cleanup_task():
    asyncio.create_task(cleanup_old_videos())

@app.get("/ping")
async def ping():
    return {"status": "awake", "message": "El servidor está activo."}

api_router = APIRouter(prefix="/api")

# --- MODELOS PYDANTIC ---
class AnalyticsAnalyzeRequest(BaseModel):
    athlete_name: str
    fatigue_data: list
    soreness_data: list
    recent_workouts_count: int
    recent_prs: list
    
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
    web_push_subscription: Optional[dict] = None
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
    athleteContext: dict = {}
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

# --- LÍMITE DE INTENTOS (en memoria del servidor) ---
LOGIN_MAX_FAILURES = 10
LOGIN_WINDOW_SECONDS = 15 * 60
AI_MAX_REQUESTS_PER_HOUR = int(os.environ.get('AI_MAX_REQUESTS_PER_HOUR', 60))
_rate_buckets: Dict[str, List[float]] = {}

def too_many_attempts(key: str, limit: int, window_seconds: int) -> bool:
    now = time.time()
    if len(_rate_buckets) > 10000:
        for k in [k for k, v in _rate_buckets.items() if not v or now - v[-1] >= window_seconds]:
            _rate_buckets.pop(k, None)
    recent = [t for t in _rate_buckets.get(key, []) if now - t < window_seconds]
    _rate_buckets[key] = recent
    return len(recent) >= limit

def record_attempt(key: str):
    _rate_buckets.setdefault(key, []).append(time.time())

def check_ai_quota(user: dict):
    key = f"ai:{user['id']}"
    if too_many_attempts(key, AI_MAX_REQUESTS_PER_HOUR, 3600):
        raise HTTPException(status_code=429, detail="Has alcanzado el límite de peticiones a la IA. Prueba de nuevo en un rato.")
    record_attempt(key)

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

def send_email_async(to_email: str, subject: str, body: str):
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

        # Se envía como HTML para que quede presentable
        msg.attach(MIMEText(body, 'html'))

        server = smtplib.SMTP(smtp_server, smtp_port)
        server.starttls()
        server.login(smtp_user, smtp_pass)
        server.send_message(msg)
        server.quit()
        logger.info(f"Email enviado correctamente a {to_email}")
        return True
    except Exception as e:
        logger.error(f"Fallo al enviar email a {to_email}: {str(e)}")
        return False

# Configuración VAPID
VAPID_PRIVATE_KEY = os.environ.get('VAPID_PRIVATE_KEY')
VAPID_CLAIMS = {
    "sub": os.environ.get('VAPID_SUBJECT', "mailto:claudiakiter31@gmail.com")
}

def send_web_push(subscription_info: dict, title: str, message: str):
    if not subscription_info or not isinstance(subscription_info, dict):
        logger.warning("No hay información de suscripción web válida.")
        return False
    if not VAPID_PRIVATE_KEY:
        logger.warning("VAPID_PRIVATE_KEY no configurada. Saltando web push.")
        return False

    try:
        payload = json.dumps({"title": title, "body": message})
        webpush(
            subscription_info=subscription_info,
            data=payload,
            vapid_private_key=VAPID_PRIVATE_KEY,
            vapid_claims=VAPID_CLAIMS
        )
        return True
    except Exception as e:
        logger.error(f"Fallo enviando web push: {str(e)}")
        return False

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

@api_router.post("/brain/generate-workout")
async def generate_workout_api(data: GeminiChatRequest, user=Depends(get_current_user)):
    global COOLDOWN_PRO_UNTIL

    if not GEMINI_API_KEY:
        raise HTTPException(status_code=500, detail="API de Gemini no configurada.")

    if data.athlete_id:
        await ensure_athlete_access(user, data.athlete_id)
    check_ai_quota(user)
        
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
                    rpe = w.get('completion_data', {}).get('rpe', '?')
                    nombres_ejercicios = [ex.get('name') for ex in w.get('exercises', [])[:3]]
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

        fatiga = data.athleteContext.get('fatigue', '-')
        dolor = data.athleteContext.get('soreness', '-')
        fase_ciclo = data.athleteContext.get('cycle_phase', 'No registrada')
        
        system_prompt = f"""
        Eres un preparador físico de élite y experto en alto rendimiento.
        Estás diseñando una sesión para {nombre_atleta}.
        Tu tono es conversacional, cercano, empático pero muy profesional y basado en la ciencia deportiva. 
        
        CONTEXTO BIOMÉTRICO Y DEPORTIVO DE {nombre_atleta.upper()}:
        {contexto_atleta}
        
        ESTADO HOY: 
        Fatiga {fatiga}/5, Dolor/Agujetas {dolor}/5. Fase del ciclo: {fase_ciclo}.
        
        RESPONDE ÚNICAMENTE CON JSON PURO USANDO ESTA ESTRUCTURA EXACTA. 
        Tienes dos formas de crear bloques dentro de "exercises": TRADICIONAL (Fuerza) o HIIT (Circuito). Puedes mezclarlos.

        {{
            "coach_analysis": "Análisis interno. ¿Cómo afecta su fatiga, lesiones o historial al plan de hoy?",
            "response_message": "Respuesta conversacional motivadora dirigiéndote a {nombre_atleta}.",
            "workoutData": {{
                "title": "Nombre de la sesión",
                "notes": "Indicaciones generales (calentamiento, enfoque).",
                "exercises": [
                    {{
                        "is_hiit_block": false,
                        "name": "Sentadilla Búlgara", 
                        "sets": "3", 
                        "reps": "10-12", 
                        "duration": "", 
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
            }}
        }}
        """

        model_pro_id = "models/gemini-3.1-pro-preview"
        model_flash_id = "models/gemini-2.5-flash"
        
        intentar_pro = time.time() > COOLDOWN_PRO_UNTIL
        modelo_actual_id = model_pro_id if intentar_pro else model_flash_id
        
        if not intentar_pro:
            tiempo_restante = int(COOLDOWN_PRO_UNTIL - time.time())
            logger.info(f"Usando modelo Flash (Pro en cooldown por {tiempo_restante}s más).")

        try:
            model = genai.GenerativeModel(model_name=modelo_actual_id)
            model.generation_config = {"response_mime_type": "application/json"}
            chat = model.start_chat(history=[])
            chat.send_message(system_prompt)
            response = chat.send_message(data.userMessage)
            
        except Exception as e:
            error_str = str(e)
            if "429" in error_str or "Quota" in error_str or isinstance(e, ResourceExhausted):
                if intentar_pro:
                    cooldown_seconds = 60
                    match = re.search(r'retry_delay\s*\{\s*seconds:\s*(\d+)\s*\}', error_str)
                    if match:
                        cooldown_seconds = int(match.group(1)) + 5
                        
                    logger.warning(f"Cuota de Gemini Pro excedida. Aplicando cooldown de {cooldown_seconds}s. Cambiando a Flash...")
                    COOLDOWN_PRO_UNTIL = time.time() + cooldown_seconds
                    
                    try:
                        logger.info("Lanzando petición de rescate con modelo Flash...")
                        model_fallback = genai.GenerativeModel(model_name=model_flash_id)
                        model_fallback.generation_config = {"response_mime_type": "application/json"}
                        chat = model_fallback.start_chat(history=[])
                        chat.send_message(system_prompt)
                        response = chat.send_message(data.userMessage)
                    except Exception as e_fallback:
                        logger.error(f"Error en modelo Flash de rescate: {str(e_fallback)}")
                        raise HTTPException(status_code=500, detail="Error en IA (ambos modelos fallaron).")
                else:
                    logger.error("Cuota excedida incluso en el modelo Flash.")
                    raise HTTPException(status_code=429, detail="Límite de peticiones alcanzado. Por favor, espera un poco.")
            else:
                logger.error(f"Error IA desconocido: {error_str}")
                raise HTTPException(status_code=500, detail="Error conectando con la IA.")

        raw_text = response.text.strip()
        if raw_text.startswith("```"):
            raw_text = raw_text.replace("```json", "").replace("```", "").strip()
        
        return json.loads(raw_text)
        
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error general en endpoint IA: {str(e)}")
        raise HTTPException(status_code=500, detail="Error conectando con la IA.")

@api_router.post("/brain/analyze-analytics")
async def analyze_analytics_api(data: AnalyticsAnalyzeRequest, user=Depends(get_current_user)):
    global COOLDOWN_PRO_UNTIL
    if not GEMINI_API_KEY:
        raise HTTPException(status_code=500, detail="API de Gemini no configurada.")
    check_ai_quota(user)
        
    try:
        system_prompt = f"""
        Eres un preparador físico de élite analizando los datos recientes de {data.athlete_name}.
        Analiza estos datos con un tono muy profesional, directo y científico.
        
        Datos de los últimos 14 días:
        - Curva de Fatiga (0-5): {data.fatigue_data}
        - Curva de Agujetas/Dolor (0-5): {data.soreness_data}
        - Entrenamientos (últimos 30d): {data.recent_workouts_count}
        - Mejores marcas recientes (PRs): {', '.join(data.recent_prs) if data.recent_prs else 'Ninguno registrado'}
        
        RESPONDE ÚNICAMENTE CON JSON PURO USANDO ESTA ESTRUCTURA EXACTA:
        {{
            "workload_analysis": "Párrafo analizando la tendencia de su fatiga y dolor en estos 14 días. ¿Hay riesgo de sobreentrenamiento o está asimilando bien las cargas?",
            "progress_analysis": "Párrafo evaluando su constancia ({data.recent_workouts_count} sesiones) y su evolución en las marcas (PRs).",
            "recommendations": ["Tip técnico 1", "Tip técnico 2", "Tip técnico 3"]
        }}
        """

        model_pro_id = "models/gemini-3.1-pro-preview"
        model_flash_id = "models/gemini-2.5-flash"
        
        intentar_pro = time.time() > COOLDOWN_PRO_UNTIL
        modelo_actual_id = model_pro_id if intentar_pro else model_flash_id

        try:
            model = genai.GenerativeModel(model_name=modelo_actual_id)
            model.generation_config = {"response_mime_type": "application/json"}
            response = model.generate_content(system_prompt)
        except Exception as e:
            # CORRECCIÓN BUG 1 APLICADA AQUÍ (isinstance sin comillas)
            if intentar_pro and ("429" in str(e) or "Quota" in str(e) or isinstance(e, ResourceExhausted)):
                COOLDOWN_PRO_UNTIL = time.time() + 60
                model_fallback = genai.GenerativeModel(model_name=model_flash_id)
                model_fallback.generation_config = {"response_mime_type": "application/json"}
                response = model_fallback.generate_content(system_prompt)
            else:
                raise e

        raw_text = response.text.strip()
        if raw_text.startswith("```"):
            raw_text = raw_text.replace("```json", "").replace("```", "").strip()
        
        return json.loads(raw_text)
        
    except Exception as e:
        logger.error(f"Error en analíticas IA: {str(e)}")
        raise HTTPException(status_code=500, detail="Error conectando con la IA.")

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
                
            background_tasks.add_task(send_email_async, trainer['email'], titulo, mensaje_html)

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
    if too_many_attempts(attempts_key, LOGIN_MAX_FAILURES, LOGIN_WINDOW_SECONDS):
        raise HTTPException(status_code=429, detail="Demasiados intentos fallidos. Espera 15 minutos y vuelve a probar.")
    user = await db.users.find_one({"email": data.email})
    if not user or not verify_password(data.password, user.get('password')):
        record_attempt(attempts_key)
        raise HTTPException(status_code=401, detail="Email o contraseña incorrectos")
    _rate_buckets.pop(attempts_key, None)
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
async def update_profile(data: ProfileUpdate, user=Depends(get_current_user)):
    update_data = {k: v for k, v in data.dict().items() if v is not None}
    await db.users.update_one({"id": user['id']}, {"$set": update_data})
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
    await db.workouts.delete_many({"athlete_id": athlete_id})
    await db.wellness.delete_many({"athlete_id": athlete_id})
    await db.tests.delete_many({"athlete_id": athlete_id})
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
            background_tasks.add_task(send_email_async, athlete['email'], titulo, mensaje_html)

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
                    background_tasks.add_task(send_email_async, athlete['email'], titulo, mensaje_html)
                    
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

@api_router.put("/workouts/{workout_id}")
async def update_workout(workout_id: str, data: WorkoutUpdate, background_tasks: BackgroundTasks, user=Depends(get_current_user)):
    existing = await ensure_workout_access(user, workout_id)
    update_data = data.dict(exclude_unset=True)
    if update_data.get('athlete_id'): await ensure_athlete_access(user, update_data['athlete_id'])
    if update_data.get('microciclo_id'): await ensure_micro_access(user, update_data['microciclo_id'])
    update_data.pop("is_ai", None) 
    await db.workouts.update_one({"id": workout_id}, {"$set": update_data})
    
    if data.completed is True and not existing.get('completed') and user.get('role') == 'athlete' and user.get('trainer_id'):
        trainer = await db.users.find_one({"id": user['trainer_id']})
        if trainer and trainer.get('web_push_subscription'):
            background_tasks.add_task(send_web_push, trainer['web_push_subscription'], "✅ ¡Entrenamiento superado!", f"{user.get('name')} ha terminado '{existing.get('title')}'.")
    return {"status": "success"}

@api_router.delete("/workouts/{workout_id}")
async def delete_workout(workout_id: str, user=Depends(get_current_user)):
    await ensure_workout_access(user, workout_id)
    await db.workouts.delete_one({"id": workout_id})
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
        trainer = await db.users.find_one({"id": user['trainer_id']})
        if trainer and trainer.get('web_push_subscription'):
            nombre_test = (data.custom_name if data.custom_name else data.test_name).upper()
            background_tasks.add_task(send_web_push, trainer['web_push_subscription'], "📏 Nuevo registro físico", f"{user.get('name')} ha registrado: {nombre_test} ({data.value} {data.unit})")
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
