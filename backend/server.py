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

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

# MongoDB connection
mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

# Variables de Strava (Configúralas en el panel de Render)
STRAVA_CLIENT_ID = os.getenv("STRAVA_CLIENT_ID")
STRAVA_CLIENT_SECRET = os.getenv("STRAVA_CLIENT_SECRET")

# JWT Config
JWT_SECRET = os.environ.get('JWT_SECRET', 'fitness-tracker-secret-key-2026')
JWT_ALGORITHM = 'HS256'
JWT_EXPIRATION_HOURS = 72

security = HTTPBearer()

app = FastAPI()
api_router = APIRouter(prefix="/api")

# --- Models ---
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

class TestUpdate(BaseModel):
    value: Optional[float] = None
    unit: Optional[str] = None
    notes: Optional[str] = None
    value_left: Optional[float] = None
    value_right: Optional[float] = None

class WorkoutUpdate(BaseModel):
    title: Optional[str] = None
    exercises: Optional[List[dict]] = None
    notes: Optional[str] = None
    completed: Optional[bool] = None
    completion_data: Optional[dict] = None
    observations: Optional[str] = None
    microciclo_id: Optional[str] = None

# MODELOS DE PERIODIZACIÓN
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
    notas: Optional[str] = ""

class MacrocicloUpdate(BaseModel):
    nombre: Optional[str] = None
    fecha_inicio: Optional[str] = None
    fecha_fin: Optional[str] = None
    color: Optional[str] = None
    objetivo: Optional[str] = None

class MicrocicloUpdate(BaseModel):
    nombre: Optional[str] = None
    tipo: Optional[str] = None
    fecha_inicio: Optional[str] = None
    fecha_fin: Optional[str] = None
    color: Optional[str] = None
    notas: Optional[str] = None

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

# --- Object Storage Helpers ---
STORAGE_URL = "https://integrations.emergentagent.com/objstore/api/v1/storage"
EMERGENT_KEY = os.environ.get("EMERGENT_LLM_KEY")
APP_NAME = "fitness-tracker"
_storage_key = None

def init_storage():
    global _storage_key
    if _storage_key:
        return _storage_key
    resp = requests.post(f"{STORAGE_URL}/init", json={"emergent_key": EMERGENT_KEY}, timeout=30)
    resp.raise_for_status()
    _storage_key = resp.json()["storage_key"]
    return _storage_key

def put_object(path: str, data: bytes, content_type: str) -> dict:
    key = init_storage()
    resp = requests.put(
        f"{STORAGE_URL}/objects/{path}",
        headers={"X-Storage-Key": key, "Content-Type": content_type},
        data=data, timeout=120
    )
    resp.raise_for_status()
    return resp.json()

def get_object(path: str):
    key = init_storage()
    resp = requests.get(
        f"{STORAGE_URL}/objects/{path}",
        headers={"X-Storage-Key": key}, timeout=60
    )
    resp.raise_for_status()
    return resp.content, resp.headers.get("Content-Type", "application/octet-stream")

# --- Auth Routes ---
@api_router.post("/auth/register")
async def register(data: UserRegister):
    existing = await db.users.find_one({"email": data.email})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    user_id = str(uuid.uuid4())
    user = {
        "id": user_id,
        "email": data.email,
        "password": hash_password(data.password),
        "name": data.name,
        "role": "trainer",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.users.insert_one(user)
    token = create_token(user_id, "trainer")
    return {"token": token, "user": {k: v for k, v in user.items() if k not in ('password', '_id')}}

@api_router.post("/auth/login")
async def login(data: UserLogin):
    user = await db.users.find_one({"email": data.email}, {"_id": 0})
    if not user or not verify_password(data.password, user['password']):
        raise HTTPException(status_code=401, detail="Invalid credentials")
    token = create_token(user['id'], user['role'])
    return {"token": token, "user": {k: v for k, v in user.items() if k != 'password'}}

@api_router.get("/auth/me")
async def get_me(user=Depends(get_current_user)):
    settings = await db.settings.find_one({"user_id": user['id']}, {"_id": 0})
    user_data = {k: v for k, v in user.items() if k != 'password'}
    user_data['settings'] = settings or {
        "notifications_enabled": True,
        "notifications_workouts": True,
        "notifications_tests": True,
        "weight_unit": "kg",
        "height_unit": "cm",
        "language": "es",
    }
    return user_data

# --- Profile & Settings ---
@api_router.put("/profile")
async def update_profile(data: ProfileUpdate, user=Depends(get_current_user)):
    update_data = {k: v for k, v in data.dict().items() if v is not None}
    if not update_data:
        raise HTTPException(status_code=400, detail="No data to update")
    await db.users.update_one({"id": user['id']}, {"$set": update_data})
    updated = await db.users.find_one({"id": user['id']}, {"_id": 0, "password": 0})
    return updated

@api_router.get("/settings")
async def get_settings(user=Depends(get_current_user)):
    settings = await db.settings.find_one({"user_id": user['id']}, {"_id": 0})
    if not settings:
        default = {
            "user_id": user['id'],
            "notifications_enabled": True,
            "notifications_workouts": True,
            "notifications_tests": True,
            "weight_unit": "kg",
            "height_unit": "cm",
            "language": "es",
        }
        await db.settings.insert_one(default)
        return {k: v for k, v in default.items() if k != '_id'}
    return settings

# --- STRAVA CALLBACK (CORREGIDO) ---
@api_router.get("/auth/strava/callback")
async def strava_callback(code: str, state: str):
    # Verificamos manualmente el token que viene en 'state' para saber quién es Claudia
    try:
        payload = jwt.decode(state, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        user_id = payload['user_id']
    except Exception:
        raise HTTPException(status_code=401, detail="Sesión expirada durante la conexión con Strava")

    # Pedimos el token real a Strava
    response = requests.post("https://www.strava.com/oauth/token", data={
        "client_id": int(STRAVA_CLIENT_ID),
        "client_secret": STRAVA_CLIENT_SECRET,
        "code": code,
        "grant_type": "authorization_code"
    })
    
    if response.status_code != 200:
        raise HTTPException(status_code=400, detail="Error de comunicación con Strava")
        
    strava_data = response.json()
    
    # Guardamos el token en la base de datos de Claudia
    await db.users.update_one(
        {"id": user_id},
        {"$set": {
            "strava_token": strava_data['access_token'], 
            "strava_id": strava_data['athlete']['id']
        }}
    )
    
    # Redirigimos de vuelta a la App (Vercel)
    return RedirectResponse(url="https://fit-tracker-azure-iota.vercel.app/settings?strava=success")

# --- LÓGICA PARA ACTUALIZAR DATOS DESDE EL DASHBOARD ---
@api_router.get("/analytics/summary")
async def analytics_summary(user=Depends(get_current_user)):
    target_id = user['id']
    
    # 1. Intentamos actualizar datos desde Strava si hay token
    if "strava_token" in user:
        try:
            # Pedimos las últimas actividades a Strava
            headers = {"Authorization": f"Bearer {user['strava_token']}"}
            # Traemos la última actividad para ver el pulso
            r = requests.get("https://www.strava.com/api/v3/athlete/activities?per_page=1", headers=headers)
            if r.status_code == 200:
                last_act = r.json()[0]
                # Guardamos el pulso medio como "Pulso en reposo" reciente
                await db.physical_tests.update_one(
                    {"athlete_id": target_id, "test_name": "hr_rest"},
                    {"$set": {
                        "value": last_act.get("average_heartrate", 60),
                        "date": datetime.now(timezone.utc).strftime('%Y-%m-%d'),
                        "unit": "bpm"
                    }},
                    upsert=True
                )
        except Exception as e:
            print(f"Error sincronizando Strava: {e}")

    # 2. El resto del resumen (lo que ya tenías)
    total_workouts = await db.workouts.count_documents({"athlete_id": target_id})
    completed_workouts = await db.workouts.count_documents({"athlete_id": target_id, "completed": True})
    
    # Buscamos el último wellness para los pasos
    latest_well = await db.wellness.find_one({"athlete_id": target_id}, sort=[("date", -1)])

    # Buscamos el hr_rest que acabamos de actualizar
    hr_test = await db.physical_tests.find_one({"athlete_id": target_id, "test_name": "hr_rest"})

    return {
        "total_workouts": total_workouts,
        "completed_workouts": completed_workouts,
        "latest_wellness": latest_well or {"steps": 0},
        "latest_tests": {"hr_rest": hr_test or {"value": "--"}},
        "completion_rate": round((completed_workouts / total_workouts * 100) if total_workouts > 0 else 0, 1),
    }
    @api_router.post("/auth/strava/sync")
async def sync_strava_data(user=Depends(get_current_user)):
    if "strava_token" not in user:
        raise HTTPException(status_code=400, detail="Strava no conectado")
    
    try:
        headers = {"Authorization": f"Bearer {user['strava_token']}"}
        # Pedimos las actividades de las últimas 24h
        url = "https://www.strava.com/api/v3/athlete/activities?per_page=1"
        r = requests.get(url, headers=headers)
        
        if r.status_code == 200:
            data = r.json()
            if data:
                last_act = data[0]
                # Actualizamos el pulso
                await db.physical_tests.update_one(
                    {"athlete_id": user['id'], "test_name": "hr_rest"},
                    {"$set": {
                        "value": last_act.get("average_heartrate", 60),
                        "date": datetime.now(timezone.utc).strftime('%Y-%m-%d'),
                        "unit": "bpm"
                    }},
                    upsert=True
                )
        return {"status": "success", "message": "Datos actualizados"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@api_router.put("/settings")
async def update_settings(data: SettingsUpdate, user=Depends(get_current_user)):
    update_data = {k: v for k, v in data.dict().items() if v is not None}
    if not update_data:
        raise HTTPException(status_code=400, detail="No data to update")
    existing = await db.settings.find_one({"user_id": user['id']})
    if existing:
        await db.settings.update_one({"user_id": user['id']}, {"$set": update_data})
    else:
        default = {
            "user_id": user['id'],
            "notifications_enabled": True,
            "notifications_workouts": True,
            "notifications_tests": True,
            "weight_unit": "kg",
            "height_unit": "cm",
            "language": "es",
        }
        default.update(update_data)
        await db.settings.insert_one(default)
    updated = await db.settings.find_one({"user_id": user['id']}, {"_id": 0})
    return updated

@api_router.put("/profile/password")
async def change_password(data: PasswordChange, user=Depends(get_current_user)):
    full_user = await db.users.find_one({"id": user['id']})
    if not verify_password(data.current_password, full_user['password']):
        raise HTTPException(status_code=400, detail="Contraseña actual incorrecta")
    await db.users.update_one({"id": user['id']}, {"$set": {"password": hash_password(data.new_password)}})
    return {"message": "Contraseña actualizada"}

# --- Athlete Management ---
@api_router.post("/athletes")
async def create_athlete(data: AthleteCreate, trainer=Depends(require_trainer)):
    existing = await db.users.find_one({"email": data.email})
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    athlete_id = str(uuid.uuid4())
    athlete = {
        "id": athlete_id,
        "email": data.email,
        "password": hash_password(data.password),
        "name": data.name,
        "role": "athlete",
        "trainer_id": trainer['id'],
        "sport": data.sport,
        "position": data.position,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.users.insert_one(athlete)
    return {k: v for k, v in athlete.items() if k not in ('password', '_id')}

@api_router.get("/athletes")
async def list_athletes(user=Depends(get_current_user)):
    if user['role'] == 'trainer':
        return await db.users.find({"trainer_id": user['id'], "role": "athlete"}, {"_id": 0, "password": 0}).to_list(1000)
    return []

@api_router.get("/athletes/{athlete_id}")
async def get_athlete(athlete_id: str, user=Depends(get_current_user)):
    athlete = await db.users.find_one({"id": athlete_id, "role": "athlete"}, {"_id": 0, "password": 0})
    if not athlete:
        raise HTTPException(status_code=404, detail="Athlete not found")
    if user['role'] == 'trainer' and athlete.get('trainer_id') != user['id']:
        raise HTTPException(status_code=403, detail="Not your athlete")
    return athlete

@api_router.delete("/athletes/{athlete_id}")
async def delete_athlete(athlete_id: str, trainer=Depends(require_trainer)):
    result = await db.users.delete_one({"id": athlete_id, "trainer_id": trainer['id']})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Athlete not found")
    await db.workouts.delete_many({"athlete_id": athlete_id})
    return {"message": "Athlete deleted"}

# --- Periodization ---
@api_router.post("/macrociclos")
async def create_macrociclo(data: MacrocicloCreate, trainer=Depends(require_trainer)):
    macro_id = str(uuid.uuid4())
    macro = {
        "id": macro_id,
        "nombre": data.nombre,
        "fecha_inicio": data.fecha_inicio,
        "fecha_fin": data.fecha_fin,
        "color": data.color,
        "objetivo": data.objetivo,
        "athlete_id": data.athlete_id,
        "trainer_id": trainer['id'],
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.macrociclos.insert_one(macro)
    return {k: v for k, v in macro.items() if k != '_id'}

@api_router.get("/periodization/tree/{athlete_id}")
async def get_periodization_tree(athlete_id: str, user=Depends(get_current_user)):
    macrociclos = await db.macrociclos.find({"athlete_id": athlete_id}, {"_id": 0}).sort("fecha_inicio", 1).to_list(100)
    macro_ids = [m['id'] for m in macrociclos]
    microciclos = await db.microciclos.find({"macrociclo_id": {"$in": macro_ids}}, {"_id": 0}).sort("fecha_inicio", 1).to_list(500)
    micro_ids = [m['id'] for m in microciclos]
    workouts = await db.workouts.find({"microciclo_id": {"$in": micro_ids}}, {"_id": 0}).sort("date", 1).to_list(1000)

    tree = []
    for macro in macrociclos:
        micros_in_macro = [m for m in microciclos if m['macrociclo_id'] == macro['id']]
        for micro in micros_in_macro:
            micro['workouts'] = [w for w in workouts if w.get('microciclo_id') == micro['id']]
        macro['microciclos'] = micros_in_macro
        tree.append(macro)
    return tree

# --- Workouts ---
@api_router.post("/workouts")
async def create_workout(data: WorkoutCreate, trainer=Depends(require_trainer)):
    workout_id = str(uuid.uuid4())
    workout = {
        "id": workout_id,
        "trainer_id": trainer['id'],
        "athlete_id": data.athlete_id,
        "microciclo_id": data.microciclo_id,
        "date": data.date,
        "title": data.title,
        "exercises": data.exercises,
        "notes": data.notes,
        "completed": False,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.workouts.insert_one(workout)
    return {k: v for k, v in workout.items() if k != '_id'}

@api_router.get("/workouts")
async def list_workouts(athlete_id: Optional[str] = None, date: Optional[str] = None, user=Depends(get_current_user)):
    query = {}
    if user['role'] == 'athlete':
        query['athlete_id'] = user['id']
    elif user['role'] == 'trainer':
        query['trainer_id'] = user['id']
        if athlete_id: query['athlete_id'] = athlete_id
    if date: query['date'] = date
    return await db.workouts.find(query, {"_id": 0}).sort("date", -1).to_list(1000)

@api_router.put("/workouts/{workout_id}")
async def update_workout(workout_id: str, data: WorkoutUpdate, user=Depends(get_current_user)):
    update_data = {k: v for k, v in data.dict().items() if v is not None}
    if not update_data:
        raise HTTPException(status_code=400, detail="No data to update")
    result = await db.workouts.update_one({"id": workout_id}, {"$set": update_data})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Workout not found")
    return await db.workouts.find_one({"id": workout_id}, {"_id": 0})

# --- Wellness ---
@api_router.post("/wellness")
async def submit_wellness(data: WellnessCreate, user=Depends(get_current_user)):
    if user['role'] != 'athlete':
        raise HTTPException(status_code=403, detail="Only athletes can submit wellness")
    today = datetime.now(timezone.utc).strftime('%Y-%m-%d')
    existing = await db.wellness.find_one({"athlete_id": user['id'], "date": today})
    if existing: return {"message": "Ya rellenado hoy"}
    record = {
        "id": str(uuid.uuid4()),
        "athlete_id": user['id'],
        "date": today,
        "sleep": data.sleep,
        "stress": data.stress,
        "fatigue": data.fatigue,
        "hr_rest": data.hr_rest,
        "steps": data.steps,
        "sleep_hours": data.sleep_hours,
        "notes": data.notes,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.wellness.insert_one(record)
    return {k: v for k, v in record.items() if k != '_id'}

@api_router.get("/wellness/today")
async def check_today_wellness(user=Depends(get_current_user)):
    if user['role'] != 'athlete': return {"submitted": True}
    today = datetime.now(timezone.utc).strftime('%Y-%m-%d')
    existing = await db.wellness.find_one({"athlete_id": user['id'], "date": today})
    return {"submitted": bool(existing)}

# Include router e inicio
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)
if __name__ == "__main__":
    import uvicorn
    import os
    # Render asigna un puerto en la variable de entorno PORT
    port = int(os.environ.get("PORT", 10000))
    uvicorn.run(app, host="0.0.0.0", port=port)

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
