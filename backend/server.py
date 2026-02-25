from fastapi import FastAPI, APIRouter, HTTPException, Depends, UploadFile, File
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from fastapi.responses import StreamingResponse
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

# JWT Config
JWT_SECRET = os.environ.get('JWT_SECRET', 'fitness-tracker-secret-key-2026')
JWT_ALGORITHM = 'HS256'
JWT_EXPIRATION_HOURS = 72

security = HTTPBearer()

app = FastAPI()
api_router = APIRouter(prefix="/api")

# --- Models ---
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

class TestCreate(BaseModel):
    athlete_id: str
    test_type: str  # strength or plyometrics
    test_name: str  # e.g. squat_rm, cmj, sj, dj, bench_rm, deadlift_rm, custom
    value: float
    unit: str
    date: str
    notes: Optional[str] = ""
    custom_name: Optional[str] = ""

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
    weight_unit: Optional[str] = None  # kg or lb
    height_unit: Optional[str] = None  # cm or ft
    language: Optional[str] = None  # es or en

class TestUpdate(BaseModel):
    value: Optional[float] = None
    unit: Optional[str] = None
    notes: Optional[str] = None

class WorkoutUpdate(BaseModel):
    title: Optional[str] = None
    exercises: Optional[List[dict]] = None
    notes: Optional[str] = None
    completed: Optional[bool] = None
    completion_data: Optional[dict] = None

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
    # Also load settings
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
async def change_password(
    data: PasswordChange,
    user=Depends(get_current_user)
):
    full_user = await db.users.find_one({"id": user['id']})
    if not verify_password(data.current_password, full_user['password']):
        raise HTTPException(status_code=400, detail="Contraseña actual incorrecta")
    await db.users.update_one({"id": user['id']}, {"$set": {"password": hash_password(data.new_password)}})
    return {"message": "Contraseña actualizada"}


# --- Athlete Management (Trainer) ---
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
        athletes = await db.users.find(
            {"trainer_id": user['id'], "role": "athlete"},
            {"_id": 0, "password": 0}
        ).to_list(1000)
        return athletes
    return []

@api_router.get("/athletes/{athlete_id}")
async def get_athlete(athlete_id: str, user=Depends(get_current_user)):
    athlete = await db.users.find_one({"id": athlete_id, "role": "athlete"}, {"_id": 0, "password": 0})
    if not athlete:
        raise HTTPException(status_code=404, detail="Athlete not found")
    if user['role'] == 'trainer' and athlete.get('trainer_id') != user['id']:
        raise HTTPException(status_code=403, detail="Not your athlete")
    if user['role'] == 'athlete' and user['id'] != athlete_id:
        raise HTTPException(status_code=403, detail="Access denied")
    return athlete

@api_router.delete("/athletes/{athlete_id}")
async def delete_athlete(athlete_id: str, trainer=Depends(require_trainer)):
    result = await db.users.delete_one({"id": athlete_id, "trainer_id": trainer['id']})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Athlete not found")
    await db.workouts.delete_many({"athlete_id": athlete_id})
    await db.physical_tests.delete_many({"athlete_id": athlete_id})
    return {"message": "Athlete deleted"}

# --- Workouts ---
@api_router.post("/workouts")
async def create_workout(data: WorkoutCreate, trainer=Depends(require_trainer)):
    workout_id = str(uuid.uuid4())
    workout = {
        "id": workout_id,
        "trainer_id": trainer['id'],
        "athlete_id": data.athlete_id,
        "date": data.date,
        "title": data.title,
        "exercises": data.exercises,
        "notes": data.notes,
        "completed": False,
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.workouts.insert_one(workout)
    return {k: v for k, v in workout.items() if k != '_id'}

@api_router.post("/workouts/csv")
async def upload_csv_workouts(athlete_id: str, file: UploadFile = File(...), trainer=Depends(require_trainer)):
    content = await file.read()
    text = content.decode('utf-8')
    reader = csv.DictReader(io.StringIO(text))
    
    # Expected columns: dia, ejercicio, repeticiones, series
    workouts_by_date: dict = {}
    for row in reader:
        # Normalize column names (strip whitespace, lowercase)
        row = {k.strip().lower(): v.strip() for k, v in row.items()}
        date = row.get('dia', row.get('date', datetime.now(timezone.utc).strftime('%Y-%m-%d')))
        exercise_name = row.get('ejercicio', row.get('exercise', ''))
        reps = row.get('repeticiones', row.get('reps', ''))
        sets = row.get('series', row.get('sets', ''))
        
        if not exercise_name:
            continue
            
        exercise = {"name": exercise_name, "sets": sets, "reps": reps, "weight": "", "rest": "", "video_url": row.get('video', '')}
        
        if date not in workouts_by_date:
            workouts_by_date[date] = []
        workouts_by_date[date].append(exercise)
    
    workouts_created = []
    for date, exercises in workouts_by_date.items():
        workout_id = str(uuid.uuid4())
        workout = {
            "id": workout_id,
            "trainer_id": trainer['id'],
            "athlete_id": athlete_id,
            "date": date,
            "title": f"Entreno {date}",
            "exercises": exercises,
            "notes": "Importado desde CSV",
            "completed": False,
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
        await db.workouts.insert_one(workout)
        workouts_created.append({k: v for k, v in workout.items() if k != '_id'})
    return {"count": len(workouts_created), "workouts": workouts_created}

@api_router.get("/workouts/csv-template")
async def download_csv_template():
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(['dia', 'ejercicio', 'repeticiones', 'series', 'video'])
    writer.writerow(['2026-02-24', 'Sentadilla', '8', '4', 'https://youtube.com/watch?v=example1'])
    writer.writerow(['2026-02-24', 'Press banca', '10', '3', ''])
    writer.writerow(['2026-02-24', 'Peso muerto', '6', '4', 'https://drive.google.com/file/example'])
    writer.writerow(['2026-02-25', 'Zancadas', '12', '3', ''])
    writer.writerow(['2026-02-25', 'Remo con barra', '10', '4', ''])
    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=plantilla_entrenamientos.csv"}
    )

@api_router.get("/workouts")
async def list_workouts(
    athlete_id: Optional[str] = None,
    date: Optional[str] = None,
    user=Depends(get_current_user)
):
    query = {}
    if user['role'] == 'athlete':
        query['athlete_id'] = user['id']
    elif user['role'] == 'trainer':
        query['trainer_id'] = user['id']
        if athlete_id:
            query['athlete_id'] = athlete_id
    if date:
        query['date'] = date
    workouts = await db.workouts.find(query, {"_id": 0}).sort("date", -1).to_list(1000)
    return workouts

@api_router.get("/workouts/{workout_id}")
async def get_workout(workout_id: str, user=Depends(get_current_user)):
    workout = await db.workouts.find_one({"id": workout_id}, {"_id": 0})
    if not workout:
        raise HTTPException(status_code=404, detail="Workout not found")
    return workout

@api_router.put("/workouts/{workout_id}")
async def update_workout(workout_id: str, data: WorkoutUpdate, user=Depends(get_current_user)):
    update_data = {k: v for k, v in data.dict().items() if v is not None}
    if not update_data:
        raise HTTPException(status_code=400, detail="No data to update")
    result = await db.workouts.update_one({"id": workout_id}, {"$set": update_data})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Workout not found")
    updated = await db.workouts.find_one({"id": workout_id}, {"_id": 0})
    return updated

@api_router.delete("/workouts/{workout_id}")
async def delete_workout(workout_id: str, trainer=Depends(require_trainer)):
    result = await db.workouts.delete_one({"id": workout_id, "trainer_id": trainer['id']})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Workout not found")
    return {"message": "Workout deleted"}

# --- Physical Tests ---
@api_router.post("/tests")
async def create_test(data: TestCreate, user=Depends(get_current_user)):
    if user['role'] == 'trainer':
        athlete = await db.users.find_one({"id": data.athlete_id, "trainer_id": user['id']})
        if not athlete:
            raise HTTPException(status_code=404, detail="Athlete not found")
    elif user['role'] == 'athlete' and data.athlete_id != user['id']:
        raise HTTPException(status_code=403, detail="Can only add your own tests")
    test_id = str(uuid.uuid4())
    test = {
        "id": test_id,
        "athlete_id": data.athlete_id,
        "created_by": user['id'],
        "test_type": data.test_type,
        "test_name": data.test_name,
        "custom_name": data.custom_name or "",
        "value": data.value,
        "unit": data.unit,
        "date": data.date,
        "notes": data.notes or "",
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    await db.physical_tests.insert_one(test)
    return {k: v for k, v in test.items() if k != '_id'}

@api_router.get("/tests")
async def list_tests(
    athlete_id: Optional[str] = None,
    test_type: Optional[str] = None,
    test_name: Optional[str] = None,
    user=Depends(get_current_user)
):
    query = {}
    if user['role'] == 'athlete':
        query['athlete_id'] = user['id']
    elif user['role'] == 'trainer':
        if athlete_id:
            query['athlete_id'] = athlete_id
    if test_type:
        query['test_type'] = test_type
    if test_name:
        query['test_name'] = test_name
    tests = await db.physical_tests.find(query, {"_id": 0}).sort("date", -1).to_list(1000)
    return tests

@api_router.get("/tests/history")
async def test_history(
    athlete_id: str,
    test_name: str,
    user=Depends(get_current_user)
):
    query = {"athlete_id": athlete_id, "test_name": test_name}
    tests = await db.physical_tests.find(query, {"_id": 0}).sort("date", 1).to_list(1000)
    return tests

@api_router.put("/tests/{test_id}")
async def update_test(test_id: str, data: TestUpdate, user=Depends(get_current_user)):
    update_data = {k: v for k, v in data.dict().items() if v is not None}
    if not update_data:
        raise HTTPException(status_code=400, detail="No data to update")
    result = await db.physical_tests.update_one({"id": test_id}, {"$set": update_data})
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Test not found")
    updated = await db.physical_tests.find_one({"id": test_id}, {"_id": 0})
    return updated

@api_router.delete("/tests/{test_id}")
async def delete_test(test_id: str, user=Depends(get_current_user)):
    result = await db.physical_tests.delete_one({"id": test_id})
    if result.deleted_count == 0:
        raise HTTPException(status_code=404, detail="Test not found")
    return {"message": "Test deleted"}

# --- Analytics ---
@api_router.get("/analytics/summary")
async def analytics_summary(
    athlete_id: Optional[str] = None,
    user=Depends(get_current_user)
):
    target_id = athlete_id if user['role'] == 'trainer' and athlete_id else user['id']
    total_workouts = await db.workouts.count_documents({"athlete_id": target_id})
    completed_workouts = await db.workouts.count_documents({"athlete_id": target_id, "completed": True})
    total_tests = await db.physical_tests.count_documents({"athlete_id": target_id})
    
    # Get latest test for each test_name
    latest_tests = {}
    test_names = await db.physical_tests.distinct("test_name", {"athlete_id": target_id})
    for tn in test_names:
        latest = await db.physical_tests.find_one(
            {"athlete_id": target_id, "test_name": tn},
            {"_id": 0},
            sort=[("date", -1)]
        )
        if latest:
            latest_tests[tn] = latest

    # Week workouts
    week_ago = (datetime.now(timezone.utc) - timedelta(days=7)).strftime('%Y-%m-%d')
    week_workouts = await db.workouts.count_documents({"athlete_id": target_id, "date": {"$gte": week_ago}})

    return {
        "total_workouts": total_workouts,
        "completed_workouts": completed_workouts,
        "total_tests": total_tests,
        "latest_tests": latest_tests,
        "week_workouts": week_workouts,
        "completion_rate": round((completed_workouts / total_workouts * 100) if total_workouts > 0 else 0, 1),
    }

@api_router.get("/analytics/progress")
async def analytics_progress(
    athlete_id: str,
    user=Depends(get_current_user)
):
    # Get all tests grouped by test_name with their history
    test_names = await db.physical_tests.distinct("test_name", {"athlete_id": athlete_id})
    progress = {}
    for tn in test_names:
        history = await db.physical_tests.find(
            {"athlete_id": athlete_id, "test_name": tn},
            {"_id": 0}
        ).sort("date", 1).to_list(100)
        if len(history) >= 2:
            first_val = history[0]['value']
            last_val = history[-1]['value']
            change = round(((last_val - first_val) / first_val * 100) if first_val != 0 else 0, 1)
        else:
            change = 0
        progress[tn] = {
            "history": history,
            "change_percent": change,
            "latest": history[-1] if history else None,
        }
    return progress

# Include router
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

@app.on_event("shutdown")
async def shutdown_db_client():
    client.close()
