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


def fake_gemini(monkeypatch, responses):
    """Sustituye la llamada real a Gemini. `responses` = {modelo: texto JSON o excepción}. Devuelve la lista de modelos usados."""
    calls = []
    monkeypatch.setattr(server, "GEMINI_API_KEY", "fake")
    server.GEMINI_COOLDOWN_UNTIL.clear()

    async def fake_generate(model, system_prompt, contents, timeout_s=45):
        calls.append((model, contents))
        r = responses.get(model, Exception("404 NOT_FOUND: model is no longer available"))
        if isinstance(r, Exception):
            raise r
        return r

    async def fake_discover():
        return [m for m in responses if m.startswith("descubierto")]

    monkeypatch.setattr(server, "gemini_generate", fake_generate)
    monkeypatch.setattr(server, "discover_gemini_models", fake_discover)
    return calls


def test_ai_requests_are_rate_limited(client, world, monkeypatch):
    monkeypatch.setattr(server, "AI_MAX_REQUESTS_PER_HOUR", 2)
    fake_gemini(monkeypatch, {m: "{}" for m in server.GEMINI_MODELS})
    body = {"athlete_name": "x", "fatigue_data": [], "soreness_data": [], "recent_workouts_count": 0, "recent_prs": []}
    h = auth(world["token_a"])
    assert client.post("/api/brain/analyze-analytics", headers=h, json=body).status_code == 200
    assert client.post("/api/brain/analyze-analytics", headers=h, json=body).status_code == 200
    assert client.post("/api/brain/analyze-analytics", headers=h, json=body).status_code == 429


def test_server_upload_endpoint_is_removed(client, world):
    res = client.post("/api/upload", headers=auth(world["token_a"]), files={"file": ("x.m3u8", b"#EXTM3U")})
    assert res.status_code in (404, 405)


def test_tests_can_be_edited_only_by_owner(client, world):
    res = client.put(f"/api/tests/{world['test_b']}", headers=auth(world["token_b"]), json={"value": 120, "notes": "Nueva marca"})
    assert res.status_code == 200
    assert res.json()["test"]["value"] == 120
    stored = [t for t in client.get("/api/tests", headers=auth(world["token_b"])).json() if t["id"] == world["test_b"]][0]
    assert stored["value"] == 120 and stored["date"] == "2026-10-01"
    assert client.put(f"/api/tests/{world['test_b']}", headers=auth(world["token_a"]), json={"value": 1}).status_code == 403


def test_google_login_accepts_new_web_client(client, monkeypatch):
    from google.oauth2 import id_token
    monkeypatch.setattr(id_token, "verify_oauth2_token", lambda token, request, audience=None: {"aud": server.GOOGLE_WEB_CLIENT_ID, "email": "coach.a@test.com", "name": "G"})
    assert client.post("/api/auth/google", json={"token": "x"}).status_code == 200
    monkeypatch.setattr(id_token, "verify_oauth2_token", lambda token, request, audience=None: {"aud": "otra-app.apps.googleusercontent.com", "email": "coach.a@test.com", "name": "G"})
    assert client.post("/api/auth/google", json={"token": "x"}).status_code == 401


AI_SESSION = '{"response_message": "Aquí tienes", "workouts": [{"date": "2026-11-12", "title": "Fuerza", "notes": "", "exercises": [{"name": "Plancha", "sets": "3", "reps": "", "duration": "30s"}]}, {"date": "2026-11-14", "title": "Core", "exercises": [{"name": "Dead bug", "sets": "3", "reps": "10"}]}]}'


def test_ai_falls_back_to_next_model_when_one_is_retired(client, world, monkeypatch):
    first, second = server.GEMINI_MODELS[0], server.GEMINI_MODELS[1]
    calls = fake_gemini(monkeypatch, {first: Exception("404 NOT_FOUND: model is no longer available"), second: "```json\n" + AI_SESSION + "\n```"})
    history = [{"role": "user", "parts": [{"text": "hola"}]}, {"role": "model", "parts": [{"text": "¿Qué preparo?"}]}]
    res = client.post("/api/brain/generate-workout", headers=auth(world["token_b"]),
                      json={"userMessage": "sesiones para mañana y el viernes", "athlete_id": world["athlete_b"], "chatHistory": history})
    assert res.status_code == 200, res.text
    data = res.json()
    assert [w["date"] for w in data["workouts"]] == ["2026-11-12", "2026-11-14"]
    assert data["workoutData"]["title"] == "Fuerza"  # compatibilidad con versiones antiguas de la app
    assert [c[0] for c in calls] == [first, second]
    contents = calls[-1][1]
    assert [c.role for c in contents] == ["user", "model", "user"]  # el historial de la conversación llega a la IA
    assert contents[-1].parts[0].text == "sesiones para mañana y el viernes"


def test_ai_uses_discovered_model_when_all_configured_fail(client, world, monkeypatch):
    calls = fake_gemini(monkeypatch, {"descubierto-flash": AI_SESSION})
    res = client.post("/api/brain/generate-workout", headers=auth(world["token_b"]), json={"userMessage": "hola"})
    assert res.status_code == 200, res.text
    assert calls[-1][0] == "descubierto-flash"


def test_ai_old_single_workout_format_still_works(client, world, monkeypatch):
    fake_gemini(monkeypatch, {server.GEMINI_MODELS[0]: '{"response_message": "ok", "workoutData": {"title": "A", "exercises": [{"name": "Sentadilla"}]}}'})
    data = client.post("/api/brain/generate-workout", headers=auth(world["token_b"]), json={"userMessage": "hola"}).json()
    assert len(data["workouts"]) == 1 and data["workouts"][0]["title"] == "A"


def test_ai_errors_are_clear(client, world, monkeypatch):
    fake_gemini(monkeypatch, {m: Exception("429 RESOURCE_EXHAUSTED") for m in server.GEMINI_MODELS})
    res = client.post("/api/brain/generate-workout", headers=auth(world["token_b"]), json={"userMessage": "hola"})
    assert res.status_code == 429 and "saturada" in res.json()["detail"]

    fake_gemini(monkeypatch, {m: Exception("500 INTERNAL") for m in server.GEMINI_MODELS})
    res = client.post("/api/brain/generate-workout", headers=auth(world["token_b"]), json={"userMessage": "hola"})
    assert res.status_code == 503 and "no responde" in res.json()["detail"]


def test_ai_invalid_key_is_reported(client, world, monkeypatch):
    calls = fake_gemini(monkeypatch, {m: Exception("400 INVALID_ARGUMENT. API key not valid. Please pass a valid API key.") for m in server.GEMINI_MODELS})
    res = client.post("/api/brain/generate-workout", headers=auth(world["token_b"]), json={"userMessage": "hola"})
    assert res.status_code == 500 and "GEMINI_API_KEY" in res.json()["detail"]
    assert len(calls) == 1  # no sigue probando modelos si la clave está mal


def test_ai_model_without_permission_tries_next(client, world, monkeypatch):
    first, second = server.GEMINI_MODELS[0], server.GEMINI_MODELS[1]
    fake_gemini(monkeypatch, {first: Exception("403 PERMISSION_DENIED: model not available for this project"), second: AI_SESSION})
    assert client.post("/api/brain/generate-workout", headers=auth(world["token_b"]), json={"userMessage": "hola"}).status_code == 200



def test_ai_slow_model_is_skipped_and_remembered(client, world, monkeypatch):
    import asyncio
    first, second = server.GEMINI_MODELS[0], server.GEMINI_MODELS[1]
    calls = fake_gemini(monkeypatch, {first: asyncio.TimeoutError(), second: AI_SESSION})
    h = auth(world["token_b"])
    assert client.post("/api/brain/generate-workout", headers=h, json={"userMessage": "hola"}).status_code == 200
    assert [c[0] for c in calls] == [first, second]
    # La siguiente petición empieza directamente por el modelo que sí respondió
    assert client.post("/api/brain/generate-workout", headers=h, json={"userMessage": "otra"}).status_code == 200
    assert calls[-1][0] == second and len(calls) == 3


def test_ai_all_slow_returns_clear_timeout(client, world, monkeypatch):
    import asyncio
    fake_gemini(monkeypatch, {m: asyncio.TimeoutError() for m in server.GEMINI_MODELS})
    res = client.post("/api/brain/generate-workout", headers=auth(world["token_b"]), json={"userMessage": "hola"})
    assert res.status_code == 504 and "tardando demasiado" in res.json()["detail"]


def test_gemini_generate_has_a_time_limit(monkeypatch):
    import asyncio

    class SlowModels:
        async def generate_content(self, **kwargs):
            await asyncio.sleep(10)

    slow_client = type("C", (), {"aio": type("A", (), {"models": SlowModels()})()})()
    monkeypatch.setattr(server, "get_gemini_client", lambda: slow_client)
    started = time.time()
    with pytest.raises(asyncio.TimeoutError):
        asyncio.run(server.gemini_generate("x", "prompt", [], timeout_s=0.2))
    assert time.time() - started < 5



def test_rate_limits_are_stored_in_the_database(client, world):
    """En Vercel puede haber varias copias del servidor: los intentos fallidos se cuentan en MongoDB, no en memoria."""
    for _ in range(3):
        assert client.post("/api/auth/login", json={"email": "coach.a@test.com", "password": "mala"}).status_code == 401
    import asyncio
    assert asyncio.run(server.db.rate_limits.count_documents({"key": "login:coach.a@test.com"})) == 3
    assert client.post("/api/auth/login", json={"email": "coach.a@test.com", "password": "secret123"}).status_code == 200
    assert asyncio.run(server.db.rate_limits.count_documents({"key": "login:coach.a@test.com"})) == 0


def test_notifications_are_sent_before_responding_on_vercel(client, world, monkeypatch):
    sent = []
    monkeypatch.setattr(server, "ON_VERCEL", True)
    monkeypatch.setattr(server, "send_email_async", lambda *a: sent.append(a[0]) or True)
    workout = {"title": "Sesión", "date": "2026-10-02", "exercises": [], "athlete_id": world["athlete_b"]}
    assert client.post("/api/workouts", headers=auth(world["token_b"]), json=workout).status_code == 200
    assert sent == ["athlete.b@test.com"]


def test_database_works_across_event_loops(monkeypatch):
    """Simula Vercel: cada petición con un bucle de eventos distinto. La base de datos debe seguir funcionando."""
    import asyncio
    created = []

    class FakeMotor:
        def __init__(self, url, io_loop=None):
            created.append(io_loop)
        def __getitem__(self, name):
            return {"users": "coleccion"}
        def close(self):
            pass

    monkeypatch.setattr(server, "AsyncIOMotorClient", FakeMotor)
    safe_db = server.LoopSafeDatabase("mongodb://x", "db")

    async def use():
        return safe_db["users"]

    assert asyncio.run(use()) == "coleccion"
    assert asyncio.run(use()) == "coleccion"
    assert len(created) == 2 and created[0] is not created[1]  # un cliente por bucle
