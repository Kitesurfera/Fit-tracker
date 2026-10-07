"""Tests de control de acceso: un entrenador solo puede ver y gestionar a sus atletas.

Se ejecutan contra la app en memoria (mongomock-motor), sin servidor real:
    pip install mongomock-motor
    pytest backend/tests/test_access_control.py
"""
import os
import sys
import time
import uuid
from pathlib import Path

import pytest

os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")
os.environ.setdefault("DB_NAME", "test_access_control")
os.environ.setdefault("JWT_SECRET", "test-secret")
os.environ["TRAINER_SIGNUP_EMAILS"] = "coach.a@test.com, Coach.B@test.com"

mongomock_motor = pytest.importorskip("mongomock_motor")
from fastapi.testclient import TestClient  # noqa: E402

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import server  # noqa: E402


@pytest.fixture()
def client():
    server.db = mongomock_motor.AsyncMongoMockClient()[f"test_{uuid.uuid4().hex}"]
    server._rate_buckets.clear()
    return TestClient(server.app)


def auth(token):
    return {"Authorization": f"Bearer {token}"}


def register(client, email):
    res = client.post("/api/auth/register", json={"email": email, "password": "secret123", "name": email})
    assert res.status_code == 200, res.text
    return res.json()["token"]


def create_athlete(client, token, email):
    res = client.post("/api/athletes", headers=auth(token), json={"email": email, "password": "athlete123", "name": email, "gender": "Femenino"})
    assert res.status_code == 200, res.text
    return res.json()["id"]


def login(client, email, password):
    res = client.post("/api/auth/login", json={"email": email, "password": password})
    assert res.status_code == 200, res.text
    return res.json()["token"]


@pytest.fixture()
def world(client):
    token_a = register(client, "coach.a@test.com")
    token_b = register(client, "coach.b@test.com")
    athlete_a = create_athlete(client, token_a, "athlete.a@test.com")
    athlete_b = create_athlete(client, token_b, "athlete.b@test.com")
    token_athlete_a = login(client, "athlete.a@test.com", "athlete123")

    workout = {"title": "Sesión B", "date": "2026-10-01", "exercises": [], "athlete_id": athlete_b}
    res = client.post("/api/workouts", headers=auth(token_b), json=workout)
    assert res.status_code == 200
    workout_b = res.json()["id"]
    assert client.get("/api/workouts", headers=auth(token_b)).json()[0]["id"] == workout_b

    test = {"athlete_id": athlete_b, "test_type": "strength", "test_name": "squat", "value": 100, "unit": "kg", "date": "2026-10-01"}
    test_b = client.post("/api/tests", headers=auth(token_b), json=test).json()["test"]["id"]

    macro = {"athlete_id": athlete_b, "nombre": "Temporada", "fecha_inicio": "2026-01-01", "fecha_fin": "2026-12-31"}
    macro_b = client.post("/api/macrociclos", headers=auth(token_b), json=macro).json()["macro"]["id"]

    return dict(
        token_a=token_a, token_b=token_b, token_athlete_a=token_athlete_a,
        athlete_a=athlete_a, athlete_b=athlete_b, workout_b=workout_b, test_b=test_b, macro_b=macro_b,
    )


# --- Registro y Google ---

def test_register_closed_for_unlisted_email(client):
    res = client.post("/api/auth/register", json={"email": "intruso@test.com", "password": "x", "name": "x"})
    assert res.status_code == 403


def test_register_allowed_email_is_case_insensitive(client):
    register(client, "COACH.A@test.com")


def test_google_login_ignores_client_role(client, monkeypatch):
    from google.oauth2 import id_token

    def fake_verify(token, request, audience=None):
        return {"aud": server.GOOGLE_CLIENT_ID, "email": token, "name": "G"}

    monkeypatch.setattr(id_token, "verify_oauth2_token", fake_verify)

    res = client.post("/api/auth/google", json={"token": "intruso@test.com", "role": "trainer"})
    assert res.status_code == 403

    res = client.post("/api/auth/google", json={"token": "coach.a@test.com", "role": "admin"})
    assert res.status_code == 200
    assert res.json()["user"]["role"] == "trainer"


# --- Aislamiento entre entrenadores ---

def test_trainer_cannot_read_other_trainers_athlete(client, world):
    h = auth(world["token_a"])
    b = world["athlete_b"]
    assert client.get(f"/api/athletes/{b}", headers=h).status_code == 403
    assert client.get(f"/api/wellness/history/{b}", headers=h).status_code == 403
    assert client.get(f"/api/analytics/summary?athlete_id={b}", headers=h).status_code == 403
    assert client.get(f"/api/periodization/tree/{b}", headers=h).status_code == 403
    assert client.get(f"/api/workouts?athlete_id={b}", headers=h).status_code == 403
    assert client.get(f"/api/tests?athlete_id={b}", headers=h).status_code == 403
    assert client.get(f"/api/analytics/monthly-summary/{b}", headers=h).status_code == 404


def test_unfiltered_lists_only_include_own_athletes(client, world):
    h = auth(world["token_a"])
    assert client.get("/api/workouts", headers=h).json() == []
    assert client.get("/api/tests", headers=h).json() == []


def test_trainer_cannot_modify_other_trainers_athlete(client, world):
    h = auth(world["token_a"])
    b = world["athlete_b"]
    res = client.put(f"/api/athletes/{b}", headers=h, json={"password": "hacked", "email": "x@test.com"})
    assert res.status_code == 404
    assert client.patch(f"/api/athletes/{b}/cycles", headers=h, json={"macro_ciclo": "x", "micro_ciclo": "y"}).status_code == 404
    assert client.delete(f"/api/athletes/{b}", headers=h).status_code == 404
    # La atleta B sigue pudiendo entrar con su contraseña original
    login(client, "athlete.b@test.com", "athlete123")


def test_trainer_cannot_take_over_another_trainer(client, world):
    trainer_b_id = client.get("/api/auth/me", headers=auth(world["token_b"])).json()["user"]["id"]
    res = client.put(f"/api/athletes/{trainer_b_id}", headers=auth(world["token_a"]), json={"password": "hacked"})
    assert res.status_code == 404
    login(client, "coach.b@test.com", "secret123")


def test_trainer_cannot_touch_other_trainers_records(client, world):
    h = auth(world["token_a"])
    assert client.put(f"/api/workouts/{world['workout_b']}", headers=h, json={"title": "x"}).status_code == 403
    assert client.delete(f"/api/workouts/{world['workout_b']}", headers=h).status_code == 403
    assert client.delete(f"/api/tests/{world['test_b']}", headers=h).status_code == 403
    assert client.put(f"/api/macrociclos/{world['macro_b']}", headers=h, json={"nombre": "x"}).status_code == 403
    assert client.delete(f"/api/macrociclos/{world['macro_b']}", headers=h).status_code == 403
    micro = {"macrociclo_id": world["macro_b"], "nombre": "S1", "fecha_inicio": "2026-01-01", "fecha_fin": "2026-01-07", "tipo": "CARGA", "color": "#fff"}
    assert client.post("/api/microciclos", headers=h, json=micro).status_code == 403


def test_trainer_cannot_create_records_for_other_trainers_athlete(client, world):
    h = auth(world["token_a"])
    b = world["athlete_b"]
    workout = {"title": "x", "date": "2026-10-02", "exercises": [], "athlete_id": b}
    assert client.post("/api/workouts", headers=h, json=workout).status_code == 403
    assert client.post("/api/workouts/bulk", headers=h, json={"workouts": [workout]}).status_code == 403
    test = {"athlete_id": b, "test_type": "strength", "test_name": "squat", "value": 1, "unit": "kg", "date": "2026-10-02"}
    assert client.post("/api/tests", headers=h, json=test).status_code == 403
    macro = {"athlete_id": b, "nombre": "x", "fecha_inicio": "2026-01-01", "fecha_fin": "2026-02-01"}
    assert client.post("/api/macrociclos", headers=h, json=macro).status_code == 403
    wellness = {"fatigue": 1, "stress": 1, "sleep_quality": 1, "soreness": 1, "athlete_id": b}
    assert client.post("/api/wellness", headers=h, json=wellness).status_code == 403


def test_athlete_cannot_read_or_modify_others(client, world):
    h = auth(world["token_athlete_a"])
    assert client.get(f"/api/athletes/{world['athlete_b']}", headers=h).status_code == 403
    assert client.put(f"/api/workouts/{world['workout_b']}", headers=h, json={"completed": True}).status_code == 403
    assert client.delete(f"/api/tests/{world['test_b']}", headers=h).status_code == 403


# --- El flujo legítimo sigue funcionando ---

def test_trainer_manages_own_athlete(client, world):
    h = auth(world["token_b"])
    b = world["athlete_b"]
    athlete = client.get(f"/api/athletes/{b}", headers=h).json()
    assert athlete["id"] == b and "password" not in athlete
    assert len(client.get("/api/workouts", headers=h).json()) == 1
    assert client.put(f"/api/workouts/{world['workout_b']}", headers=h, json={"title": "Nueva"}).status_code == 200
    assert client.put(f"/api/athletes/{b}", headers=h, json={"phone": "600"}).status_code == 200
    assert client.get(f"/api/periodization/tree/{b}", headers=h).json()["macros"][0]["id"] == world["macro_b"]
    assert client.delete(f"/api/athletes/{b}", headers=h).status_code == 200
    assert client.get("/api/workouts", headers=h).json() == []
    assert client.get("/api/tests", headers=h).json() == []


def test_athlete_accesses_own_data(client, world):
    h = auth(world["token_athlete_a"])
    a = world["athlete_a"]
    me = client.get(f"/api/athletes/{a}", headers=h).json()
    assert me["id"] == a and "password" not in me
    wellness = {"fatigue": 2, "stress": 2, "sleep_quality": 4, "soreness": 1}
    assert client.post("/api/wellness", headers=h, json=wellness).status_code == 200
    assert len(client.get(f"/api/wellness/history/{a}", headers=h).json()) == 1


def test_brain_memory_is_scoped_per_trainer(client, world):
    assert client.get("/api/brain/memory", headers=auth(world["token_b"])).json()["total_learned"] == 1
    assert client.get("/api/brain/memory", headers=auth(world["token_a"])).json()["total_learned"] == 0


# --- Contraseñas, sesiones y límites ---

def test_editing_athlete_without_password_keeps_old_password(client, world):
    res = client.put(f"/api/athletes/{world['athlete_a']}", headers=auth(world["token_a"]), json={"name": "Nuevo nombre", "password": ""})
    assert res.status_code == 200
    login(client, "athlete.a@test.com", "athlete123")


def test_short_passwords_are_rejected(client, world):
    h = auth(world["token_a"])
    res = client.post("/api/athletes", headers=h, json={"email": "corta@test.com", "password": "123", "name": "x", "gender": "Femenino"})
    assert res.status_code == 400
    assert client.put(f"/api/athletes/{world['athlete_a']}", headers=h, json={"password": "123"}).status_code == 400


def test_login_is_blocked_after_repeated_failures(client, world):
    for _ in range(server.LOGIN_MAX_FAILURES):
        assert client.post("/api/auth/login", json={"email": "coach.a@test.com", "password": "mala"}).status_code == 401
    res = client.post("/api/auth/login", json={"email": "coach.a@test.com", "password": "secret123"})
    assert res.status_code == 429


def test_tokens_expire_in_days_not_centuries(client):
    import jwt
    token = register(client, "coach.a@test.com")
    payload = jwt.decode(token, server.JWT_SECRET, algorithms=["HS256"])
    assert payload["exp"] - time.time() <= 31 * 24 * 3600


def test_ai_requests_are_rate_limited(client, world, monkeypatch):
    monkeypatch.setattr(server, "GEMINI_API_KEY", "fake")
    monkeypatch.setattr(server, "AI_MAX_REQUESTS_PER_HOUR", 2)

    class FakeModel:
        def __init__(self, *a, **k): pass
        def generate_content(self, prompt):
            return type("R", (), {"text": "{}"})()

    monkeypatch.setattr(server.genai, "GenerativeModel", FakeModel)
    body = {"athlete_name": "x", "fatigue_data": [], "soreness_data": [], "recent_workouts_count": 0, "recent_prs": []}
    h = auth(world["token_a"])
    assert client.post("/api/brain/analyze-analytics", headers=h, json=body).status_code == 200
    assert client.post("/api/brain/analyze-analytics", headers=h, json=body).status_code == 200
    assert client.post("/api/brain/analyze-analytics", headers=h, json=body).status_code == 429


def test_server_upload_endpoint_is_removed(client, world):
    res = client.post("/api/upload", headers=auth(world["token_a"]), files={"file": ("x.m3u8", b"#EXTM3U")})
    assert res.status_code in (404, 405)
