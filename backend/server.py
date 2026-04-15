import requests
from fastapi import FastAPI, APIRouter, HTTPException, Depends, UploadFile, File, Header, Request, BackgroundTasks
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
import shutil
import asyncio
import time
import json
import google.generativeai as genai

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

JWT_SECRET = os.environ.get('JWT_SECRET')
JWT_ALGORITHM = 'HS256'
JWT_EXPIRATION_HOURS = 876000
if not JWT_SECRET:
    logger.error("¡ERROR CRÍTICO: No se ha encontrado JWT_SECRET!")

GOOGLE_CLIENT_ID = os.environ.get('GOOGLE_CLIENT_ID', '351214985492-nn6efvp8hi5vnqrnk65g6qs1j0qma28e.apps.googleusercontent.com')
GOOGLE_ANDROID_CLIENT_ID = os.environ.get('GOOGLE_ANDROID_CLIENT_ID', '351214985492-ahg14f57mak2mcj47q6jucsvcieu4dq9.apps.googleusercontent.com')
GOOGLE_IOS_CLIENT_ID = os.environ.get('GOOGLE_IOS_CLIENT_ID', '351214985492-r7k26kmllj5j7nef3bpdcv8vg5c4robk.apps.googleusercontent.com')

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
class WellnessCreate(BaseModel):
    fatigue: int
    stress: int
    sleep_quality: int
    soreness: int
    notes: Optional[str] = ""
    cycle_phase: Optional[str] = None

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

class AthleteUpdate(BaseModel):
    name: str
    email: str
    gender: str
    password: Optional[str] = None
    sport: Optional[str] = None
    phone: Optional[str] = None 
    last_period_date: Optional[str] = None  
    cycle_length: Optional[int] = None      
    period_length: Optional[int] = None     
    is_bleeding: Optional[bool] = None      

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

class WorkoutCreate(BaseModel):
    title: str
    date: str
    exercises: List[dict]
    notes: Optional[str] = ""
    athlete_id: str
    microciclo_id: Optional[str] = None
    is_ai: Optional[bool] = False
    
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

class GeminiChatRequest(BaseModel):
    userMessage: str
    athleteContext: dict = {}
    chatHistory: list = []

# --- AUTH HELPERS ---
def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')

def verify_password(password: str, hashed: str) -> bool:
    return bcrypt.checkpw(password.encode('utf-8'), hashed.encode('utf-8'))

def create_token(user_id: str, role: str) -> str:
    payload = {
        'user_id': user_id,
        'role': role,
        'exp': datetime.now(timezone.utc) + timedelta(hours=JWT_EXPIRATION_HOURS)
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

from pywebpush import webpush, WebPushException

# Configuración VAPID
VAPID_PRIVATE_KEY = "HEbQpgf3KOB2smfjz8recSVKHC7p3sjZBjznzxrct-c"
VAPID_CLAIMS = {
    "sub": "mailto:claudiakiter31@gmail.com"
}

def send_web_push(subscription_info: dict, title: str, message: str):
    if not subscription_info or not isinstance(subscription_info, dict):
        logger.warning("No hay información de suscripción web válida.")
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

# --- RUTAS DE MACHINE LEARNING (CEREBRO IA) ---
@api_router.get("/brain/memory")
async def get_brain_memory(user=Depends(get_current_user)):
    if user['role'] != 'trainer': raise HTTPException(status_code=403, detail="No autorizado")
    count = await db.brain_memory.count_documents({})
    return {"status": "success", "total_learned": count}

@api_router.get("/brain/memory/examples")
async def get_brain_examples(user=Depends(get_current_user)):
    if user['role'] != 'trainer': raise HTTPException(status_code=403, detail="No autorizado")
    examples = await db.brain_memory.find({}, {"_id": 0, "learned_at": 0, "id": 0}).sort("learned_at", -1).limit(5).to_list(5)
    return {"status": "success", "examples": examples}

@api_router.post("/brain/generate-workout")
async def generate_workout_api(data: GeminiChatRequest, user=Depends(get_current_user)):
    if not GEMINI_API_KEY:
        raise HTTPException(status_code=500, detail="API de Gemini no configurada.")
        
    try:
        # 1. EXTRAER LA MEMORIA (El aprendizaje)
        # Buscamos los últimos 3 entrenamientos que habéis creado a mano
        recent_memories = await db.brain_memory.find({}, {"_id": 0}).sort("learned_at", -1).limit(3).to_list(3)
        
        ejemplos_memoria = ""
        if recent_memories:
            ejemplos_memoria = "\nHISTORIAL DE ENTRENAMIENTOS REALES (Imita este estilo y vocabulario):\n"
            for mem in recent_memories:
                ejemplos_memoria += f"- Título: {mem.get('title')}. "
                # Añadimos los primeros 3 ejercicios de cada sesión como contexto
                nombres_ejercicios = [ex.get('name') for ex in mem.get('exercises', [])[:3]]
                if nombres_ejercicios:
                    ejemplos_memoria += f"Ejercicios típicos: {', '.join(nombres_ejercicios)}...\n"
        
        # 2. CONFIGURACIÓN DEL MODELO
        model_id = "models/gemini-3-flash-preview"
        model = genai.GenerativeModel(model_name=model_id)
        model.generation_config = {"response_mime_type": "application/json"}
        
        # 3. EL SÚPER-PROMPT (Con la memoria inyectada)
        system_prompt = f"""
        Eres un preparador físico de élite trabajando con Andre. 
        ATLETA: Fatiga {data.athleteContext.get('fatigue', 3)}/5, Dolor {data.athleteContext.get('soreness', 3)}/5.
        
        {ejemplos_memoria}
        
        RESPONDE ÚNICAMENTE CON JSON PURO.
        {{
            "response_message": "Mensaje motivador corto.",
            "workoutData": {{
                "title": "Nombre de la sesión",
                "exercises": [
                    {{"name": "Ejercicio", "sets": 3, "reps": "10", "is_hiit_block": false, "exercise_notes": "Técnica"}}
                ]
            }}
        }}
        """
        
        chat = model.start_chat(history=[])
        chat.send_message(system_prompt)
        response = chat.send_message(data.userMessage)
        
        raw_text = response.text.strip()
        if raw_text.startswith("```"):
            raw_text = raw_text.replace("```json", "").replace("```", "").strip()
        
        return json.loads(raw_text)
        
    except Exception as e:
        logger.error(f"Error IA: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Error conectando con la IA: {str(e)}")

# --- RUTAS DE WELLNESS ---
@api_router.get("/wellness/history/{athlete_id}")
async def get_wellness_history(athlete_id: str, user=Depends(get_current_user)):
    if user['role'] != 'trainer' and user['id'] != athlete_id:
        raise HTTPException(status_code=403, detail="No autorizado")
    history = await db.wellness.find({"athlete_id": athlete_id}, {"_id": 0}).sort("date", -1).to_list(7)
    return history[::-1]

@api_router.post("/wellness")
async def create_wellness(data: WellnessCreate, background_tasks: BackgroundTasks, user=Depends(get_current_user)):
    today = datetime.now(timezone.utc).isoformat().split('T')[0]
    wellness_data = {
        "fatigue": data.fatigue, "stress": data.stress, "sleep_quality": data.sleep_quality,
        "soreness": data.soreness, "notes": data.notes, "cycle_phase": data.cycle_phase,
        "updated_at": datetime.now(timezone.utc).isoformat()
    }
    existing = await db.wellness.find_one({"athlete_id": user['id'], "date": today})
    if existing:
        await db.wellness.update_one({"_id": existing["_id"]}, {"$set": wellness_data})
    else:
        wellness_data.update({"id": str(uuid.uuid4()), "athlete_id": user['id'], "date": today, "created_at": wellness_data["updated_at"]})
        await db.wellness.insert_one(wellness_data)

    # 🤖 AGENTE FISIO: Intervención Automática
    if data.fatigue >= 4 or data.soreness >= 4:
        recovery_workout = {
            "id": str(uuid.uuid4()),
            "title": "🆘 PROTOCOLO RESET: Fluidez y Recuperación",
            "date": today,
            "athlete_id": user['id'],
            "exercises": [
                {"name": "Liberación Miofascial (Foam Roller)", "sets": 1, "reps": "5 min", "notes": "Cadenas posteriores y cuádriceps. Buscar puntos de tensión sin dolor extremo."},
                {"name": "Movilidad 90/90 de Cadera", "sets": 2, "reps": "10/lado", "notes": "Sin forzar. El objetivo es engrasar la articulación y recuperar rango."},
                {"name": "Gato-Camello + Rotaciones Torácicas", "sets": 2, "reps": "8 reps", "notes": "Conectar con la respiración. Darle espacio a la columna."},
                {"name": "Box Breathing (Respiración 4-4-4-4)", "sets": 1, "reps": "3 min", "notes": "Resetear el Sistema Nervioso Central (SNC) para bajar los niveles de cortisol."}
            ],
            "notes": "🤖 AGENTE FISIO: He detectado niveles altos de fatiga muscular. He inyectado esta sesión para priorizar la recuperación, reducir el riesgo de lesión y restaurar tus cimientos.",
            "completed": False,
            "is_ai": True
        }
        await db.workouts.insert_one(recovery_workout)

    # Notificaciones Push a Andre
    if user.get('role') == 'athlete' and user.get('trainer_id'):
        trainer = await db.users.find_one({"id": user['trainer_id']})
        if trainer and trainer.get('web_push_subscription'):
            athlete_name = user.get('name', 'Un deportista')
            titulo = f"📊 {athlete_name} actualizó su estado"
            mensaje = f"Fatiga: {data.fatigue}/5 | Agujetas: {data.soreness}/5"
            
            if data.fatigue >= 4 or data.soreness >= 4:
                titulo = f"🚨 Agente Fisio activado para {athlete_name}"
                mensaje = "Protocolo de Reset inyectado por alta fatiga muscular."
                
            background_tasks.add_task(send_web_push, trainer['web_push_subscription'], titulo, mensaje)
            
    return {"status": "success"}

@api_router.get("/analytics/summary")
async def analytics_summary(athlete_id: Optional[str] = None, user=Depends(get_current_user)):
    target_id = athlete_id if (user['role'] == 'trainer' and athlete_id) else user['id']
    target_user = await db.users.find_one({"id": target_id}, {"_id": 0})
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
    existing = await db.users.find_one({"email": data.email})
    if existing: raise HTTPException(status_code=400, detail="Email ya registrado")
    user_id = str(uuid.uuid4())
    user = {"id": user_id, "email": data.email, "password": hash_password(data.password), "name": data.name, "role": "trainer", "created_at": datetime.now(timezone.utc).isoformat()}
    await db.users.insert_one(user)
    return {"token": create_token(user_id, "trainer"), "user": {k: v for k, v in user.items() if k not in ('password', '_id')}}

@api_router.post("/auth/login")
async def login(data: UserLogin):
    user = await db.users.find_one({"email": data.email})
    if not user or not verify_password(data.password, user['password']):
        raise HTTPException(status_code=401, detail="Email o contraseña incorrectos")
    return {"token": create_token(user['id'], user['role']), "user": {k: v for k, v in user.items() if k not in ('_id', 'password')}}

@api_router.post("/auth/google")
async def google_login(data: GoogleAuth):
    try:
        import google.auth.transport.requests as google_requests
        from google.oauth2 import id_token
        
        id_info = id_token.verify_oauth2_token(data.token, google_requests.Request(), audience=None)
        
        if id_info.get('aud') not in [GOOGLE_CLIENT_ID, GOOGLE_ANDROID_CLIENT_ID, GOOGLE_IOS_CLIENT_ID]:
            raise HTTPException(status_code=401, detail="El token no pertenece a esta aplicación")

        email = id_info.get('email')
        if not email: raise HTTPException(status_code=400, detail="Token de Google no contiene email")
        
        user = await db.users.find_one({"email": email})
        if not user:
            if data.role == 'athlete': raise HTTPException(status_code=403, detail="Sin invitación activa.")
            user_id = str(uuid.uuid4())
            user = {"id": user_id, "email": email, "password": hash_password(str(uuid.uuid4())), "name": id_info.get('name', 'Usuario'), "role": data.role, "created_at": datetime.now(timezone.utc).isoformat()}
            await db.users.insert_one(user)
            
        return {"token": create_token(user['id'], user['role']), "user": {k: v for k, v in user.items() if k not in ('_id', 'password')}}
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
    return await db.users.find_one({"id": athlete_id}, {"_id": 0, "password": 0})

@api_router.post("/athletes")
async def create_athlete(data: AthleteCreate, user=Depends(get_current_user)):
    if user['role'] != 'trainer': raise HTTPException(status_code=403, detail="No autorizado")
    if await db.users.find_one({"email": data.email}): raise HTTPException(status_code=400, detail="Email ya registrado")
    athlete_id = str(uuid.uuid4())
    await db.users.insert_one({"id": athlete_id, "email": data.email, "password": hash_password(data.password), "name": data.name, "gender": data.gender, "role": "athlete", "sport": data.sport, "phone": data.phone, "trainer_id": user['id'], "created_at": datetime.now(timezone.utc).isoformat()})
    return {"status": "success", "id": athlete_id}

@api_router.put("/athletes/{athlete_id}")
async def update_athlete(athlete_id: str, data: AthleteUpdate, user=Depends(get_current_user)):
    if user['role'] != 'trainer': raise HTTPException(status_code=403, detail="No autorizado")
    update_data = {k: v for k, v in data.dict().items() if v is not None}
    if data.password: update_data["password"] = hash_password(data.password)
    await db.users.update_one({"id": athlete_id}, {"$set": update_data})
    return {"status": "success"}

@api_router.patch("/athletes/{athlete_id}/cycles")
async def update_athlete_cycles(athlete_id: str, cycles: CycleUpdate, user=Depends(get_current_user)):
    if user['role'] != 'trainer': raise HTTPException(status_code=403, detail="No autorizado")
    await db.users.update_one(
        {"id": athlete_id}, 
        {"$set": {"macro_ciclo": cycles.macro_ciclo, "micro_ciclo": cycles.micro_ciclo}}
    )
    return {"message": "Ciclos actualizados correctamente", "macro": cycles.macro_ciclo, "micro": cycles.micro_ciclo}

@api_router.delete("/athletes/{athlete_id}")
async def delete_athlete(athlete_id: str, user=Depends(get_current_user)):
    if user['role'] != 'trainer': raise HTTPException(status_code=403, detail="No autorizado")
    await db.users.delete_one({"id": athlete_id})
    await db.workouts.delete_many({"athlete_id": athlete_id})
    await db.wellness.delete_many({"athlete_id": athlete_id})
    await db.macrociclos.delete_many({"athlete_id": athlete_id})
    return {"status": "success"}

# --- ENTRENAMIENTOS E INTERCEPTOR ML ---
@api_router.post("/workouts")
async def create_workout(data: WorkoutCreate, background_tasks: BackgroundTasks, user=Depends(get_current_user)):
    workout = data.dict()
    is_ai = workout.pop("is_ai", False)
    workout.update({"id": str(uuid.uuid4()), "completed": False, "completion_data": None})
    
    await db.workouts.insert_one(workout)
    
    # 🔥 MACHINE LEARNING
    if not is_ai and user['role'] == 'trainer':
        await db.brain_memory.insert_one({
            "id": str(uuid.uuid4()),
            "title": data.title,
            "exercises": data.exercises,
            "notes": data.notes,
            "learned_at": datetime.now(timezone.utc).isoformat()
        })
    
    workout.pop('_id', None)
    
    if user['role'] == 'trainer':
        athlete = await db.users.find_one({"id": data.athlete_id})
        if athlete and athlete.get('web_push_subscription'):
            trainer_name = user.get('name', 'Tu entrenador')
            background_tasks.add_task(send_web_push, athlete['web_push_subscription'], "🏋️‍♂️ ¡Nueva sesión!", f"{trainer_name} ha añadido '{data.title}' para el {data.date}.")
    return {"status": "success", "workout": workout}

@api_router.post("/workouts/bulk")
async def create_workouts_bulk(data: WorkoutBulkCreate, background_tasks: BackgroundTasks, user=Depends(get_current_user)):
    new_workouts, athlete_ids, brain_memories = [], set(), []
    
    for w in data.workouts:
        workout = w.dict()
        is_ai = workout.pop("is_ai", False)
        workout.update({"id": str(uuid.uuid4()), "completed": False, "completion_data": None})
        new_workouts.append(workout)
        athlete_ids.add(w.athlete_id)
        
        if not is_ai and user['role'] == 'trainer':
            brain_memories.append({
                "id": str(uuid.uuid4()),
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
            trainer_name = user.get('name', 'Tu entrenador')
            for a_id in athlete_ids:
                athlete = await db.users.find_one({"id": a_id})
                if athlete and athlete.get('web_push_subscription'):
                    count = sum(1 for wk in data.workouts if wk.athlete_id == a_id)
                    background_tasks.add_task(send_web_push, athlete['web_push_subscription'], "📅 Planes actualizados", f"{trainer_name} ha añadido {count} sesiones a tu calendario.")
    return {"status": "success", "inserted": len(new_workouts)}

@api_router.get("/workouts")
async def list_workouts(athlete_id: Optional[str] = None, date: Optional[str] = None, user=Depends(get_current_user)):
    query = {'athlete_id': user['id']} if user['role'] == 'athlete' else ({'athlete_id': athlete_id} if athlete_id else {})
    if date: query['date'] = date
    return await db.workouts.find(query, {"_id": 0}).sort("date", -1).to_list(1000)

@api_router.put("/workouts/{workout_id}")
async def update_workout(workout_id: str, data: WorkoutUpdate, background_tasks: BackgroundTasks, user=Depends(get_current_user)):
    existing = await db.workouts.find_one({"id": workout_id})
    if not existing: raise HTTPException(status_code=404, detail="Sesión no encontrada")
    update_data = data.dict(exclude_unset=True)
    update_data.pop("is_ai", None) 
    await db.workouts.update_one({"id": workout_id}, {"$set": update_data})
    
    if data.completed is True and not existing.get('completed') and user.get('role') == 'athlete' and user.get('trainer_id'):
        trainer = await db.users.find_one({"id": user['trainer_id']})
        if trainer and trainer.get('web_push_subscription'):
            background_tasks.add_task(send_web_push, trainer['web_push_subscription'], "✅ ¡Entrenamiento superado!", f"{user.get('name')} ha terminado '{existing.get('title')}'.")
    return {"status": "success"}

@api_router.delete("/workouts/{workout_id}")
async def delete_workout(workout_id: str, user=Depends(get_current_user)):
    await db.workouts.delete_one({"id": workout_id})
    return {"status": "success"}

# --- PERIODIZACIÓN (Simplified Tree) ---
@api_router.get("/periodization/tree/{athlete_id}")
async def get_periodization_tree(athlete_id: str, user=Depends(get_current_user)):
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
        return {"macros": [], "unassigned_workouts": [], "error": str(e)}

@api_router.post("/macrociclos")
async def create_macro(data: MacroCreate, user=Depends(get_current_user)):
    macro = data.dict()
    macro["id"] = str(uuid.uuid4())
    await db.macrociclos.insert_one(macro)
    macro.pop('_id', None)
    return {"status": "success", "macro": macro}

@api_router.put("/macrociclos/{macro_id}")
async def update_macro(macro_id: str, data: Dict[str, Any], user=Depends(get_current_user)):
    if user['role'] != 'trainer': raise HTTPException(status_code=403, detail="No autorizado")
    update_data = {k: v for k, v in data.items() if k not in ('id', '_id', 'athlete_id')}
    await db.macrociclos.update_one({"id": macro_id}, {"$set": update_data})
    return {"status": "success"}

@api_router.delete("/macrociclos/{macro_id}")
async def delete_macro(macro_id: str, user=Depends(get_current_user)):
    if user['role'] != 'trainer': raise HTTPException(status_code=403, detail="No autorizado")
    await db.macrociclos.delete_one({"id": macro_id})
    
    micros = await db.microciclos.find({"macrociclo_id": macro_id}).to_list(100)
    micro_ids = [m["id"] for m in micros]
    await db.microciclos.delete_many({"macrociclo_id": macro_id})
    
    if micro_ids:
        await db.workouts.update_many({"microciclo_id": {"$in": micro_ids}}, {"$set": {"microciclo_id": None}})
    return {"status": "success"}

@api_router.post("/microciclos")
async def create_micro(data: MicroCreate, user=Depends(get_current_user)):
    micro = data.dict()
    micro["id"] = str(uuid.uuid4())
    await db.microciclos.insert_one(micro)
    micro.pop('_id', None)
    return {"status": "success", "micro": micro}

@api_router.put("/microciclos/{micro_id}")
async def update_micro(micro_id: str, data: Dict[str, Any], user=Depends(get_current_user)):
    if user['role'] != 'trainer': raise HTTPException(status_code=403, detail="No autorizado")
    update_data = {k: v for k, v in data.items() if k not in ('id', '_id', 'macrociclo_id')}
    await db.microciclos.update_one({"id": micro_id}, {"$set": update_data})
    return {"status": "success"}

@api_router.delete("/microciclos/{micro_id}")
async def delete_micro(micro_id: str, user=Depends(get_current_user)):
    if user['role'] != 'trainer': raise HTTPException(status_code=403, detail="No autorizado")
    await db.microciclos.delete_one({"id": micro_id})
    
    await db.workouts.update_many({"microciclo_id": micro_id}, {"$set": {"microciclo_id": None}})
    return {"status": "success"}

# --- TESTS FÍSICOS ---
@api_router.post("/tests")
async def create_test(data: TestCreate, background_tasks: BackgroundTasks, user=Depends(get_current_user)):
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
    query = {'athlete_id': user['id']} if user['role'] == 'athlete' else ({'athlete_id': athlete_id} if athlete_id else {})
    if test_type and test_type != 'all': query['test_type'] = test_type
    return await db.tests.find(query, {"_id": 0}).sort("date", -1).to_list(1000)

@api_router.delete("/tests/{test_id}")
async def delete_test(test_id: str, user=Depends(get_current_user)):
    await db.tests.delete_one({"id": test_id})
    return {"status": "success"}

@api_router.get("/analytics/monthly-summary/{athlete_id}")
async def get_monthly_summary(athlete_id: str, user=Depends(get_current_user)):
    if user['role'] != 'trainer':
        raise HTTPException(status_code=403, detail="Solo Andre puede generar informes")
    
    now = datetime.now(timezone.utc)
    start_date = (now - timedelta(days=30)).isoformat().split('T')[0]

    athlete = await db.users.find_one({"id": athlete_id})
    if not athlete:
        raise HTTPException(status_code=404, detail="Atleta no encontrado")

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

# --- SUBIDA DE ARCHIVOS ---
@api_router.post("/upload")
async def upload_file(request: Request, file: UploadFile = File(...), user=Depends(get_current_user)):
    try:
        unique_filename = f"{uuid.uuid4()}.{file.filename.split('.')[-1]}"
        file_path = UPLOAD_DIR / unique_filename
        with open(file_path, "wb") as buffer: shutil.copyfileobj(file.file, buffer)
        return {"url": f"{str(request.base_url).rstrip('/')}/uploads/{unique_filename}"}
    except Exception as e:
        logger.error(f"Error subida: {str(e)}")
        raise HTTPException(status_code=500, detail="Fallo al procesar archivo")

app.include_router(api_router)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_credentials=True, allow_methods=["*"], allow_headers=["*"])

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=int(os.environ.get("PORT", 10000)))
