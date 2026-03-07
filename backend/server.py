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
from pathlib import Path
from pydantic import BaseModel
from typing import List, Optional
from datetime import datetime, timezone, timedelta

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / '.env')

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

mongo_url = os.environ['MONGO_URL']
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ['DB_NAME']]

JWT_SECRET = os.environ.get('JWT_SECRET', 'fitness-tracker-secret-key-2026')
JWT_ALGORITHM = 'HS256'
JWT_EXPIRATION_HOURS = 72

security = HTTPBearer()
app = FastAPI()

# --- NUEVA RUTA PARA MANTENER DESPIERTO A RENDER ---
@app.get("/ping")
async def ping():
    return {"status": "awake", "message": "El servidor está activo y listo para planificar."}
# ---------------------------------------------------

api_router = APIRouter(prefix="/api")

# --- Modelos Pydantic ---
class WellnessCreate(BaseModel):
    fatigue: int
    stress: int
    sleep_quality: int
    soreness: int
    notes: Optional[str] = ""

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
    gender: str
    sport: Optional[str] = "Preparación Física"

class ProfileUpdate(BaseModel):
    name: Optional[str] = None
    sport: Optional[str] = None
    position: Optional[str] = None
    is_injured: Optional[bool] = None
    injury_notes: Optional[str] = None
    equipment: Optional[str] = None


class WorkoutUpdate(BaseModel):
    title: Optional[str] = None
    exercises: Optional[List[dict]] = None
    notes: Optional[str] = None
    completed: Optional[bool] = None
    completion_data: Optional[dict] = None
    observations: Optional[str] = None
    microciclo_id: Optional[str] = None

class WorkoutCreate(BaseModel):
    title: str
    date: str
    exercises: List[dict]
    notes: Optional[str] = ""
    athlete_id: str
    microciclo_id: Optional[str] = None
    
class WorkoutBulkCreate(BaseModel):
    workouts: List[WorkoutCreate]
    
class MacroCreate(BaseModel):
    athlete_id: str
    nombre: str
    fecha_inicio: str
    fecha_fin: str
    
class MicroCreate(BaseModel):
    macrociclo_id: str
    nombre: str
    fecha_inicio: str
    fecha_fin: str
    tipo: str
    color: str

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
    except Exception:
        raise HTTPException(status_code=401, detail="Token inválido o expirado")

async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    payload = decode_token(credentials.credentials)
    user = await db.users.find_one({"id": payload['user_id']}, {"_id": 0})
    if not user:
        raise HTTPException(status_code=401, detail="Usuario no encontrado")
    return user

# --- Rutas ---
@api_router.get("/wellness/history/{athlete_id}")
async def get_wellness_history(athlete_id: str, user=Depends(get_current_user)):
    if user['role'] != 'trainer' and user['id'] != athlete_id:
        raise HTTPException(status_code=403, detail="No autorizado")
    
    history = await db.wellness.find(
        {"athlete_id": athlete_id}, 
        {"_id": 0} 
    ).sort("date", -1).to_list(7)
    
    return history[::-1]

@api_router.post("/auth/register")
async def register(data: UserRegister):
    existing = await db.users.find_one({"email": data.email})
    if existing: raise HTTPException(status_code=400, detail="Email ya registrado")
    user_id = str(uuid.uuid4())
    user = {
        "id": user_id, "email": data.email, "password": hash_password(data.password),
        "name": data.name, "role": "trainer", "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.users.insert_one(user)
    return {"token": create_token(user_id, "trainer"), "user": {k: v for k, v in user.items() if k not in ('password', '_id')}}

@api_router.post("/auth/login")
async def login(data: UserLogin):
    user = await db.users.find_one({"email": data.email})
    if not user or not verify_password(data.password, user['password']):
        raise HTTPException(status_code=401, detail="Email o contraseña incorrectos")
    token = create_token(user['id'], user['role'])
    return {
        "token": token,
        "user": {
            "id": user['id'], "email": user['email'], "name": user['name'],
            "role": user['role'], "is_injured": user.get("is_injured", False)
        }
    }

@api_router.post("/wellness")
async def create_wellness(data: WellnessCreate, user=Depends(get_current_user)):
    today = datetime.now(timezone.utc).isoformat().split('T')[0]
    wellness_entry = {
        "id": str(uuid.uuid4()),
        "athlete_id": user['id'],
        "date": today,
        "fatigue": data.fatigue,
        "stress": data.stress,
        "sleep_quality": data.sleep_quality,
        "soreness": data.soreness,
        "notes": data.notes,
        "created_at": datetime.now(timezone.utc).isoformat()
    }
    await db.wellness.insert_one(wellness_entry)
    return {"status": "success"}

@api_router.get("/analytics/summary")
async def analytics_summary(athlete_id: Optional[str] = None, user=Depends(get_current_user)):
    target_id = athlete_id if (user['role'] == 'trainer' and athlete_id) else user['id']
    
    target_user = await db.users.find_one({"id": target_id}, {"_id": 0})
    total = await db.workouts.count_documents({"athlete_id": target_id})
    completed = await db.workouts.count_documents({"athlete_id": target_id, "completed": True})
    latest_well = await db.wellness.find_one({"athlete_id": target_id}, {"_id": 0}, sort=[("date", -1)])

    return {
        "total_workouts": total,
        "completed_workouts": completed,
        "latest_wellness": latest_well or {"fatigue": 0, "stress": 0, "sleep_quality": 0, "soreness": 0, "notes": ""},
        "completion_rate": round((completed / total * 100) if total > 0 else 0, 1),
        "is_injured": target_user.get("is_injured", False) if target_user else False,
        "injury_notes": target_user.get("injury_notes", "") if target_user else "",
        "equipment": target_user.get("equipment", "") if target_user else ""
    }

@api_router.get("/athletes")
async def list_athletes(user=Depends(get_current_user)):
    if user['role'] == 'trainer':
        return await db.users.find({"trainer_id": user['id'], "role": "athlete"}, {"_id": 0, "password": 0}).to_list(1000)
    return []

@api_router.get("/athletes/{athlete_id}")
async def get_athlete(athlete_id: str, user=Depends(get_current_user)):
    return await db.users.find_one({"id": athlete_id}, {"_id": 0, "password": 0})

@api_router.put("/profile")
async def update_profile(data: ProfileUpdate, user=Depends(get_current_user)):
    update_data = {k: v for k, v in data.dict().items() if v is not None}
    await db.users.update_one({"id": user['id']}, {"$set": update_data})
    return {"status": "success"}

@api_router.post("/workouts")
async def create_workout(data: WorkoutCreate, user=Depends(get_current_user)):
    workout = data.dict()
    workout["id"] = str(uuid.uuid4())
    workout["completed"] = False # Por defecto, un entreno nuevo está pendiente
    workout["completion_data"] = None
    
    await db.workouts.insert_one(workout)
    workout.pop('_id', None) # Limpiamos el ID de Mongo para no colapsar
    
    return {"status": "success", "workout": workout}

@api_router.post("/workouts/bulk")
async def create_workouts_bulk(data: WorkoutBulkCreate, user=Depends(get_current_user)):
    new_workouts = []
    for w in data.workouts:
        workout = w.dict()
        workout["id"] = str(uuid.uuid4())
        workout["completed"] = False
        workout["completion_data"] = None
        new_workouts.append(workout)
    
    if new_workouts:
        await db.workouts.insert_many(new_workouts)
        for w in new_workouts:
            w.pop('_id', None) # Limpiamos el ID interno
            
    return {"status": "success", "inserted": len(new_workouts)}

@api_router.get("/workouts")
async def list_workouts(athlete_id: Optional[str] = None, date: Optional[str] = None, user=Depends(get_current_user)):
    query = {}
    if user['role'] == 'athlete': query['athlete_id'] = user['id']
    elif athlete_id: query['athlete_id'] = athlete_id
    if date: query['date'] = date
    return await db.workouts.find(query, {"_id": 0}).sort("date", -1).to_list(1000)

@api_router.put("/workouts/{workout_id}")
async def update_workout(workout_id: str, data: WorkoutUpdate, user=Depends(get_current_user)):
    update_data = {k: v for k, v in data.dict().items() if v is not None}
    await db.workouts.update_one({"id": workout_id}, {"$set": update_data})
    return {"status": "success"}

# --- RUTAS DE PERIODIZACIÓN (Macrociclos y Microciclos) ---

@api_router.post("/macrociclos")
async def create_macro(data: MacroCreate, user=Depends(get_current_user)):
    macro = data.dict()
    macro["id"] = str(uuid.uuid4())
    await db.macrociclos.insert_one(macro)
    macro.pop('_id', None) # <-- Corrección
    return {"status": "success", "macro": macro}

@api_router.put("/macrociclos/{id}")
async def update_macro(id: str, data: dict, user=Depends(get_current_user)):
    await db.macrociclos.update_one({"id": id}, {"$set": data})
    return {"status": "success"}

@api_router.delete("/macrociclos/{id}")
async def delete_macro(id: str, user=Depends(get_current_user)):
    await db.macrociclos.delete_one({"id": id})
    await db.microciclos.delete_many({"macrociclo_id": id}) # Borrado en cascada
    return {"status": "success"}

@api_router.post("/microciclos")
async def create_micro(data: MicroCreate, user=Depends(get_current_user)):
    micro = data.dict()
    micro["id"] = str(uuid.uuid4())
    await db.microciclos.insert_one(micro)
    micro.pop('_id', None) # <-- Corrección
    return {"status": "success", "micro": micro}

@api_router.put("/microciclos/{id}")
async def update_micro(id: str, data: dict, user=Depends(get_current_user)):
    await db.microciclos.update_one({"id": id}, {"$set": data})
    return {"status": "success"}

@api_router.delete("/microciclos/{id}")
async def delete_micro(id: str, user=Depends(get_current_user)):
    await db.microciclos.delete_one({"id": id})
    await db.workouts.update_many({"microciclo_id": id}, {"$set": {"microciclo_id": None}}) # Desasignar workouts
    return {"status": "success"}

@api_router.delete("/workouts/{workout_id}")
async def delete_workout(workout_id: str, user=Depends(get_current_user)):
    await db.workouts.delete_one({"id": workout_id})
    return {"status": "success"}

@api_router.get("/periodization/tree/{athlete_id}")
async def get_periodization_tree(athlete_id: str, user=Depends(get_current_user)):
    try:
        # 1. Traer Macrociclos
        macros_cursor = db.macrociclos.find({"athlete_id": athlete_id}, {"_id": 0})
        macros = await macros_cursor.sort("fecha_inicio", 1).to_list(100)
        
        for m in macros:
            # 2. Traer Microciclos de cada Macro
            micros_cursor = db.microciclos.find({"macrociclo_id": m['id']}, {"_id": 0})
            micros = await micros_cursor.sort("fecha_inicio", 1).to_list(100)
            
            for mic in micros:
                # 3. Traer Workouts de cada Micro
                workouts_cursor = db.workouts.find({"microciclo_id": mic['id']}, {"_id": 0})
                mic['workouts'] = await workouts_cursor.sort("date", 1).to_list(100)
            
            m['microciclos'] = micros
            
        # 4. Traer entrenos sin asignar (Sueltos)
        unassigned_cursor = db.workouts.find({
            "athlete_id": athlete_id, 
            "$or": [{"microciclo_id": None}, {"microciclo_id": ""}]
        }, {"_id": 0})
        unassigned_workouts = await unassigned_cursor.sort("date", -1).to_list(100)
        
        return {
            "macros": macros,
            "unassigned_workouts": unassigned_workouts
        }
    except Exception as e:
        print(f"Error en el árbol de periodización: {e}")
        raise HTTPException(status_code=500, detail=str(e))


app.include_router(api_router)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_credentials=True, allow_methods=["*"], allow_headers=["*"])

if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 10000))
    uvicorn.run(app, host="0.0.0.0", port=port)
