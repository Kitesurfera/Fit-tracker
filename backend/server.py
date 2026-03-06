import requests
from fastapi import FastAPI, APIRouter, HTTPException, Depends, UploadFile, File, Query, Header
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.responses import StreamingResponse, Response, RedirectResponse
from dotenv import load_dotenv
from starlette.middleware.cors import CORSMiddleware
from motor.motor_asyncio import AsyncIOMotorClient
import os
import logging
import bcrypt
import jwt
import uuid
import csv
import io
from pathlib import Path
from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import datetime, timezone, timedelta

# Configuración inicial
ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Variables de Strava
STRAVA_CLIENT_ID = os.getenv("STRAVA_CLIENT_ID")
STRAVA_CLIENT_SECRET = os.getenv("STRAVA_CLIENT_SECRET")

# JWT Config
JWT_SECRET = os.environ.get('JWT_SECRET', 'fitness-tracker-secret-key-2026')
JWT_ALGORITHM = 'HS256'
JWT_EXPIRATION_HOURS = 72

security = HTTPBearer()
app = FastAPI()
api_router = APIRouter(prefix="/api")

# --- Modelos Pydantic ---
class WellnessCreate(BaseModel):
    sleep: int
    stress: int
    fatigue: int
    notes: Optional[str] = ""
    hr_rest: Optional[int] = None
    steps: Optional[int] = None
    sleep_hours: Optional[float] = None

class UserRegister(BaseModel):
    email: str
    password: str
    name: str
    role: str = "trainer"

class UserLogin(BaseModel):
    email: str
    password: str

class AthleteCreate(BaseModel):
    email: str
    password: str
    name: str
    sport: Optional[str] = ""
    position: Optional[str] = ""

class WorkoutCreate(BaseModel):
    athlete_id: str
    date: str
    title: str
    exercises: List[dict]
    notes: Optional[str] = ""
    microciclo_id: Optional[str] = None

class TestCreate(BaseModel):
    athlete_id: str
    test_type: str
    test_name: str
    value: float
    unit: str
    date: str
    notes: Optional[str] = ""
    custom_name: Optional[str] = ""
    value_left: Optional[float] = None
    value_right: Optional[float] = None

class ProfileUpdate(BaseModel):
    name: Optional[str] = None
    sport: Optional[str] = None
    position: Optional[str] = None

class PasswordChange(BaseModel):
    current_password: str
    new_password: str

class SettingsUpdate(BaseModel):
    notifications_enabled: Optional[bool] = None
    notifications_workouts: Optional[bool] = None
    notifications_tests: Optional[bool] = None
    weight_unit: Optional[str] = None
    height_unit: Optional[str] = None
    language: Optional[str] = None

class MacrocicloCreate(BaseModel):
    nombre: str
    fecha_inicio: str
    fecha_fin: str
    color: Optional[str] = "#4A90E2"
    objetivo: Optional[str] = ""
    athlete_id: str

class MicrocicloCreate(BaseModel):
    macrociclo_id: str
    nombre: str
    tipo: str = "CARGA"
    fecha_inicio: str
    fecha_fin: str
    color: Optional[str] = "#34C759"
    notes: Optional[str] = ""

# --- Auth Helpers ---
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
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")

async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    payload = decode_token(credentials.credentials)
    user = await db.users.find_one({"id": payload['user_id']}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user

async def require_trainer(user=Depends(get_current_user)):
    if user['role'] != 'trainer':
        raise HTTPException(status_code=403, detail="Trainer access required")
    return user

# --- Rutas de Auth ---
@api_router.post("/auth/register")
async def register(data: UserRegister):
    existing = await db.users.find_one({"email": data.email})
    if existing: raise HTTPException(status_code=400, detail="Email already registered")
    user_id = str(uuid.uuid4())
    user = {
        "id": user_id, "email": data.email, "password": hash_password(data.password),
        "name": data.name, "role": "trainer", "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.users.insert_one(user)
    return {"token": create_token(user_id, "trainer"), "user": {k: v for k, v in user.items() if k not in ('password', '_id')}}

@api_router.post("/auth/login")
async def login(data: UserLogin):
    user = await db.users.find_one({"email": data.email}, {"_id": 0})
    if not user or not verify_password(data.password, user['password']):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    return {"token": create_token(user['id'], user['role']), "user": {k: v for k, v in user.items() if k != 'password'}}

@api_router.get("/auth/strava/callback")
async def strava_callback(code: str, state: str):
    try:
        payload = jwt.decode(state, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        user_id = payload['user_id']
    except Exception:
        raise HTTPException(status_code=401, detail="Sesión expirada")

    response = requests.post("https://www.strava.com/oauth/token", data={
        "client_id": int(STRAVA_CLIENT_ID), "client_secret": STRAVA_CLIENT_SECRET,
        "code": code, "grant_type": "authorization_code"
    })
    
    if response.status_code != 200: raise HTTPException(status_code=400, detail="Error Strava")
    strava_data = response.json()
    
    await db.users.update_one(
        {"id": user_id},
        {"$set": {"strava_token": strava_data['access_token'], "strava_id": strava_data['athlete']['id']}}
    )
    return RedirectResponse(url="https://fit-tracker-azure-iota.vercel.app/settings?strava=success")

# --- Sync & Analytics (NUEVA LÓGICA DE RENDIMIENTO) ---
@api_router.post("/auth/strava/sync")
async def sync_strava_data(user=Depends(get_current_user)):
    if "strava_token" not in user: raise HTTPException(status_code=400, detail="Strava no conectado")
    try:
        headers = {"Authorization": f"Bearer {user['strava_token']}"}
        # Pedimos las 3 últimas actividades de cualquier tipo
        r = requests.get("https://www.strava.com/api/v3/athlete/activities?per_page=3", headers=headers)
        
        if r.status_code == 200 and r.json():
            last = r.json()[0]
            stats = {
                "name": last.get("name"),
                "hr": int(last.get("average_heartrate", 0)),
                "duration": round(last.get("moving_time", 0) / 60, 1),
                "date": last.get("start_date_local").split("T")[0],
                "type": last.get("type")
            }
            # Guardamos la actividad real en el perfil del usuario
            await db.users.update_one({"id": user['id']}, {"$set": {"last_workout": stats}})
            return {"status": "success", "data": stats}
        return {"status": "empty", "message": "No hay actividades registradas"}
    except Exception as e:
        logger.error(f"Sync error: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@api_router.get("/analytics/summary")
async def analytics_summary(athlete_id: Optional[str] = None, user=Depends(get_current_user)):
    # Si eres trainer, miras al athlete_id. Si eres athlete, te miras a ti.
    target_id = athlete_id if (user['role'] == 'trainer' and athlete_id) else user['id']
    
    target_user = await db.users.find_one({"id": target_id})
    total = await db.workouts.count_documents({"athlete_id": target_id})
    completed = await db.workouts.count_documents({"athlete_id": target_id, "completed": True})
    latest_well = await db.wellness.find_one({"athlete_id": target_id}, sort=[("date", -1)])

    return {
        "total_workouts": total,
        "completed_workouts": completed,
        "last_workout": target_user.get("last_workout", None),
        "latest_wellness": latest_well or {"steps": 0},
        "completion_rate": round((completed / total * 100) if total > 0 else 0, 1)
    }

# --- Rutas de Gestión (Workouts, Athletes, etc) ---
@api_router.get("/athletes")
async def list_athletes(user=Depends(get_current_user)):
    if user['role'] == 'trainer':
        return await db.users.find({"trainer_id": user['id'], "role": "athlete"}, {"_id": 0, "password": 0}).to_list(1000)
    return []

@api_router.get("/workouts")
async def list_workouts(athlete_id: Optional[str] = None, date: Optional[str] = None, user=Depends(get_current_user)):
    query = {}
    if user['role'] == 'athlete': query['athlete_id'] = user['id']
    elif athlete_id: query['athlete_id'] = athlete_id
    if date: query['date'] = date
    return await db.workouts.find(query, {"_id": 0}).sort("date", -1).to_list(1000)

@api_router.get("/periodization/tree/{athlete_id}")
async def get_periodization_tree(athlete_id: str, user=Depends(get_current_user)):
    macros = await db.macrociclos.find({"athlete_id": athlete_id}, {"_id": 0}).sort("fecha_inicio", 1).to_list(100)
    macro_ids = [m['id'] for m in macros]
    micros = await db.microciclos.find({"macrociclo_id": {"$in": macro_ids}}, {"_id": 0}).sort("fecha_inicio", 1).to_list(500)
    workouts = await db.workouts.find({"microciclo_id": {"$in": [m['id'] for m in micros]}}, {"_id": 0}).to_list(1000)
    for m in macros:
        m['microciclos'] = [mi for mi in micros if mi['macrociclo_id'] == m['id']]
        for mi in m['microciclos']:
            mi['workouts'] = [w for w in workouts if w.get('microciclo_id') == mi['id']]
    return macros

@api_router.put("/settings")
async def update_settings(data: SettingsUpdate, user=Depends(get_current_user)):
    update_data = {k: v for k, v in data.dict().items() if v is not None}
    await db.settings.update_one({"user_id": user['id']}, {"$set": update_data}, upsert=True)
    return await db.settings.find_one({"user_id": user['id']}, {"_id": 0})

@api_router.get("/settings")
async def get_settings(user=Depends(get_current_user)):
    s = await db.settings.find_one({"user_id": user['id']}, {"_id": 0})
    return s or {"notifications_enabled": True, "weight_unit": "kg", "height_unit": "cm", "language": "es"}

# --- Middleware & Startup ---
app.include_router(api_router)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_credentials=True, allow_methods=["*"], allow_headers=["*"])

if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 10000))
    uvicorn.run(app, host="0.0.0.0", port=port)
