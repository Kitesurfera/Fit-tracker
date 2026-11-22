"""Notificaciones push: a quién le llega cada aviso, preferencias de Ajustes y cifrado real del aviso.

    pip install -r requirements-dev.txt
    pytest tests/test_push_notifications.py
"""
import base64
import json
import os
import sys
import threading
import uuid
from datetime import date, timedelta
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

import pytest

os.environ.setdefault("MONGO_URL", "mongodb://localhost:27017")
os.environ.setdefault("DB_NAME", "test_push")
os.environ.setdefault("JWT_SECRET", "test-secret")
os.environ["TRAINER_SIGNUP_EMAILS"] = "coach.a@test.com, Coach.B@test.com"

mongomock_motor = pytest.importorskip("mongomock_motor")
from fastapi.testclient import TestClient  # noqa: E402

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import server  # noqa: E402

TODAY = date.today()
FUTURE = (TODAY + timedelta(days=3)).isoformat()


def auth(token):
    return {"Authorization": f"Bearer {token}"}


@pytest.fixture()
def client(monkeypatch):
    server.db = mongomock_motor.AsyncMongoMockClient()[f"test_{uuid.uuid4().hex}"]
    server._vapid_cache.clear()
    monkeypatch.delenv("VAPID_PRIVATE_KEY", raising=False)
    return TestClient(server.app)


@pytest.fixture()
def sent(monkeypatch):
    """Sustituye el envío real: guarda (endpoint, aviso) de cada notificación."""
    out = []

    def fake(sub, payload, vv):
        out.append((sub["endpoint"], json.loads(payload)))
        return "gone" if "caducado" in sub["endpoint"] else "ok"
    monkeypatch.setattr(server, "_webpush_one", fake)
    return out


def ep(name):
    return f"https://fcm.googleapis.com/fcm/send/{name}"


def subscribe(client, token, name):
    sub = {"endpoint": ep(name), "keys": {"p256dh": "BPxx", "auth": "yy"}}
    res = client.post("/api/push/subscribe", headers=auth(token), json={"subscription": sub, "device": "Android · Chrome"})
    assert res.status_code == 200, res.text
    return res.json()


@pytest.fixture()
def world(client):
    r = client.post("/api/auth/register", json={"email": "coach.a@test.com", "password": "secret123", "name": "Andre"})
    trainer = r.json()["token"]
    athlete_id = client.post("/api/athletes", headers=auth(trainer), json={"email": "ana@test.com", "password": "athlete123", "name": "Ana", "gender": "Femenino"}).json()["id"]
    athlete = client.post("/api/auth/login", json={"email": "ana@test.com", "password": "athlete123"}).json()["token"]
    subscribe(client, trainer, "movil-entrenador")
    subscribe(client, athlete, "movil-ana")
    subscribe(client, athlete, "tablet-ana")
    return dict(trainer=trainer, athlete=athlete, athlete_id=athlete_id)


def to(sent, name):
    return [p for e, p in sent if e == ep(name)]


# --- Dispositivos y preferencias ---

def test_only_real_push_services_are_accepted(client, world):
    for bad in ["http://fcm.googleapis.com/x", "https://127.0.0.1/x", "https://evil.com/fcm.googleapis.com", "https://fcm.googleapis.com.evil.com/x"]:
        res = client.post("/api/push/subscribe", headers=auth(world["athlete"]), json={"subscription": {"endpoint": bad, "keys": {"p256dh": "a", "auth": "b"}}})
        assert res.status_code == 400, bad
    for good in ["https://web.push.apple.com/abc", "https://updates.push.services.mozilla.com/wpush/v2/abc", "https://wns2-par02p.notify.windows.com/w/?token=abc"]:
        res = client.post("/api/push/subscribe", headers=auth(world["athlete"]), json={"subscription": {"endpoint": good, "keys": {"p256dh": "a", "auth": "b"}}})
        assert res.status_code == 200, good


def test_config_returns_stable_public_key_and_role_prefs(client, world):
    a = client.get("/api/push/config", headers=auth(world["athlete"])).json()
    b = client.get("/api/push/config", headers=auth(world["trainer"])).json()
    assert a["public_key"] == b["public_key"] and len(base64.urlsafe_b64decode(a["public_key"] + "==")) == 65
    server._vapid_cache.clear()  # otra copia del servidor: lee la misma clave de la base de datos
    assert client.get("/api/push/config", headers=auth(world["athlete"])).json()["public_key"] == a["public_key"]
    assert a["prefs"] == {"workout_assigned": True, "workout_changed": True, "coach_feedback": True}
    assert a["devices"] == 2
    assert b["prefs"]["wellness_submitted"] is False and b["prefs"]["workout_completed"] is True


def test_env_vapid_key_is_used_when_present(client, monkeypatch):
    from py_vapid import Vapid02
    v = Vapid02()
    v.generate_keys()
    raw = v.private_key.private_numbers().private_value.to_bytes(32, "big")
    monkeypatch.setenv("VAPID_PRIVATE_KEY", base64.urlsafe_b64encode(raw).decode().rstrip("="))
    token = client.post("/api/auth/register", json={"email": "coach.a@test.com", "password": "secret123", "name": "A"}).json()["token"]
    assert client.get("/api/push/config", headers=auth(token)).json()["public_key"] == server._vapid_public_key(v)


def test_prefs_are_saved_per_profile_and_unknown_keys_ignored(client, world, sent):
    res = client.put("/api/push/prefs", headers=auth(world["athlete"]), json={"prefs": {"workout_assigned": False, "workout_completed": True, "hack": True}})
    assert res.json()["prefs"] == {"workout_assigned": False, "workout_changed": True, "coach_feedback": True}
    client.post("/api/workouts", headers=auth(world["trainer"]), json={"title": "Fuerza", "date": FUTURE, "exercises": [], "athlete_id": world["athlete_id"]})
    assert to(sent, "movil-ana") == []


def test_unsubscribe_and_device_moves_to_new_account(client, world, sent):
    assert client.post("/api/push/unsubscribe", headers=auth(world["athlete"]), json={"endpoint": ep("tablet-ana")}).json()["devices"] == 1
    # La entrenadora inicia sesión en el móvil de Ana y activa avisos: el móvil pasa a ser suyo
    subscribe(client, world["trainer"], "movil-ana")
    client.post("/api/workouts", headers=auth(world["trainer"]), json={"title": "Fuerza", "date": FUTURE, "exercises": [], "athlete_id": world["athlete_id"]})
    assert to(sent, "movil-ana") == []


def test_test_notification_and_dead_devices_are_removed(client, world, sent):
    subscribe(client, world["athlete"], "caducado")
    res = client.post("/api/push/test", headers=auth(world["athlete"])).json()
    assert res == {"sent": 2, "devices": 3}
    assert client.get("/api/push/config", headers=auth(world["athlete"])).json()["devices"] == 2


# --- A quién le llega cada aviso ---

def test_trainer_actions_notify_the_athlete_on_every_device(client, world, sent):
    T, A = world["trainer"], world["athlete"]
    wid = client.post("/api/workouts", headers=auth(T), json={"title": "Fuerza A", "date": FUTURE, "exercises": [{"name": "Sentadilla"}], "athlete_id": world["athlete_id"]}).json()["id"]
    assert len(to(sent, "movil-ana")) == 1 and len(to(sent, "tablet-ana")) == 1 and to(sent, "movil-entrenador") == []
    p = to(sent, "movil-ana")[0]
    assert p["title"] == "🏋️ Nueva sesión: Fuerza A" and "Andre" in p["body"] and p["url"] == "/home"

    sent.clear()
    client.post("/api/workouts/bulk", headers=auth(T), json={"workouts": [
        {"title": "B", "date": (TODAY + timedelta(days=9)).isoformat(), "exercises": [], "athlete_id": world["athlete_id"]},
        {"title": "C", "date": (TODAY + timedelta(days=8)).isoformat(), "exercises": [], "athlete_id": world["athlete_id"]}]})
    p = to(sent, "movil-ana")
    assert len(p) == 1 and p[0]["title"] == "📅 Tienes 2 sesiones nuevas" and p[0]["body"].endswith(": C.")

    sent.clear()
    new_date = (TODAY + timedelta(days=4)).isoformat()
    client.put(f"/api/workouts/{wid}", headers=auth(T), json={"date": new_date})
    p = to(sent, "movil-ana")
    assert len(p) == 1 and p[0]["title"] == "📅 Sesión movida: Fuerza A" and p[0]["tag"] == f"workout-{wid}"

    sent.clear()
    client.put(f"/api/workouts/{wid}", headers=auth(T), json={"date": new_date, "title": "Fuerza A", "exercises": [{"name": "Sentadilla"}]})
    assert sent == []  # guardar sin cambios no avisa
    client.put(f"/api/workouts/{wid}", headers=auth(T), json={"exercises": [{"name": "Peso muerto"}]})
    assert to(sent, "movil-ana")[0]["title"] == "✏️ Cambios en tu sesión: Fuerza A"

    sent.clear()
    client.delete(f"/api/workouts/{wid}", headers=auth(T))
    assert to(sent, "movil-ana")[0]["title"] == "🗑️ Sesión eliminada: Fuerza A"


def test_old_sessions_do_not_notify_changes(client, world, sent):
    old = (TODAY - timedelta(days=10)).isoformat()
    wid = client.post("/api/workouts", headers=auth(world["trainer"]), json={"title": "Antigua", "date": old, "exercises": [], "athlete_id": world["athlete_id"]}).json()["id"]
    sent.clear()
    client.put(f"/api/workouts/{wid}", headers=auth(world["trainer"]), json={"title": "Antigua 2"})
    client.delete(f"/api/workouts/{wid}", headers=auth(world["trainer"]))
    assert sent == []


def test_athlete_finishes_or_skips_and_trainer_is_notified(client, world, sent):
    T, A = world["trainer"], world["athlete"]
    w1 = client.post("/api/workouts", headers=auth(T), json={"title": "Fuerza A", "date": TODAY.isoformat(), "exercises": [], "athlete_id": world["athlete_id"]}).json()["id"]
    w2 = client.post("/api/workouts", headers=auth(T), json={"title": "HIIT", "date": TODAY.isoformat(), "exercises": [], "athlete_id": world["athlete_id"]}).json()["id"]
    sent.clear()
    client.put(f"/api/workouts/{w1}", headers=auth(A), json={"completed": True, "observations": "Muy bien", "completion_data": {"rpe": 7, "duration_seconds": 3300, "sore_joints": ["knees-left"]}})
    p = to(sent, "movil-entrenador")
    assert len(p) == 1 and p[0]["title"] == "✅ Ana ha terminado «Fuerza A»"
    assert p[0]["body"] == "RPE 7/10 · 55 min · ha marcado molestias · «Muy bien»" and p[0]["url"].startswith("/athlete-detail?id=")
    assert to(sent, "movil-ana") == []  # quien hace la acción no recibe el aviso

    sent.clear()
    client.put(f"/api/workouts/{w1}", headers=auth(A), json={"completed": True, "completion_data": {"rpe": 8}})
    assert sent == []  # volver a guardar una sesión ya hecha no repite el aviso

    client.put(f"/api/workouts/{w2}", headers=auth(A), json={"completed": True, "observations": "[NO COMPLETADA] Motivo: Viaje"})
    p = to(sent, "movil-entrenador")
    assert p[0]["title"] == "⏭️ Ana no ha hecho «HIIT»" and p[0]["body"] == "Motivo: Viaje"


def test_coach_notes_notify_only_new_or_changed_notes(client, world, sent):
    T, A = world["trainer"], world["athlete"]
    wid = client.post("/api/workouts", headers=auth(T), json={"title": "Fuerza", "date": TODAY.isoformat(), "exercises": [], "athlete_id": world["athlete_id"]}).json()["id"]
    cd = {"exercise_results": [{"name": "Sentadilla"}, {"name": "Press"}], "hiit_results": [{"hiit_exercises": [{"name": "Burpees"}]}]}
    client.put(f"/api/workouts/{wid}", headers=auth(A), json={"completed": True, "completion_data": cd})
    sent.clear()
    cd["exercise_results"][1]["coach_note"] = "Codos a 45 grados"
    client.put(f"/api/workouts/{wid}", headers=auth(T), json={"completion_data": cd})
    p = to(sent, "movil-ana")
    assert p[0]["title"] == "📝 Nota de tu entrenador: Press" and p[0]["body"] == "Codos a 45 grados" and p[0]["url"] == "/analytics?tab=feedback"
    sent.clear()
    cd["hiit_results"][0]["hiit_exercises"][0]["coach_note"] = "Más ritmo"
    client.put(f"/api/workouts/{wid}", headers=auth(T), json={"completion_data": cd})
    assert [x["title"] for x in to(sent, "movil-ana")] == ["📝 Nota de tu entrenador: Burpees"]


def test_wellness_alerts_and_all_forms(client, world, sent):
    T, A = world["trainer"], world["athlete"]
    calm = {"fatigue": 2, "stress": 2, "sleep_quality": 4, "soreness": 1}
    client.post("/api/wellness", headers=auth(A), json=calm)
    assert sent == []  # por defecto, solo alertas
    client.post("/api/wellness", headers=auth(A), json={**calm, "fatigue": 5, "discomforts": {"Rodillas": "fuerte"}})
    p = to(sent, "movil-entrenador")
    assert p[0]["title"] == "⚠️ Alerta de bienestar: Ana" and p[0]["body"] == "Fatiga 5/5 ⚠️ · Dolor 1/5 · Estrés 2/5 · Sueño 4/5 · Molestias: Rodillas (fuerte)"
    sent.clear()
    client.put("/api/push/prefs", headers=auth(T), json={"prefs": {"wellness_submitted": True, "wellness_alert": False}})
    client.post("/api/wellness", headers=auth(A), json=calm)
    assert to(sent, "movil-entrenador")[0]["title"] == "📊 Ana ha rellenado el bienestar"
    sent.clear()
    client.post("/api/wellness", headers=auth(T), json={**calm, "athlete_id": world["athlete_id"]})
    assert sent == []  # si lo rellena el entrenador, no se avisa a sí mismo


def test_videos_comments_tests_and_injury(client, world, sent):
    T, A = world["trainer"], world["athlete"]
    v = client.post("/api/videos", headers=auth(A), json={"url": "https://res.cloudinary.com/slsdfq8t/video/upload/v1/x.mp4", "exercise_name": "Sentadilla"}).json()
    assert to(sent, "movil-entrenador")[0]["title"] == "🎥 Ana ha subido un vídeo"
    sent.clear()
    client.post(f"/api/videos/{v['id']}/comments", headers=auth(T), json={"text": "Rodillas fuera", "time_s": 3})
    p = to(sent, "movil-ana")
    assert len(p) == 1 and p[0]["title"] == "🎥 Corrección en tu vídeo de Sentadilla" and p[0]["body"] == "Rodillas fuera"
    sent.clear()
    client.post(f"/api/videos/{v['id']}/comments", headers=auth(A), json={"text": "¿Así mejor?"})
    assert to(sent, "movil-entrenador")[0]["body"] == "Sentadilla: ¿Así mejor?"
    sent.clear()
    client.post("/api/tests", headers=auth(A), json={"athlete_id": world["athlete_id"], "test_type": "salto", "test_name": "CMJ", "value": 35.5, "unit": "cm", "date": TODAY.isoformat()})
    assert to(sent, "movil-entrenador")[0]["body"] == "CMJ: 35.5 cm"
    sent.clear()
    client.put("/api/profile", headers=auth(A), json={"is_injured": True, "injury_notes": "Esguince tobillo"})
    p = to(sent, "movil-entrenador")
    assert p[0]["title"] == "🩹 Ana ha marcado una lesión" and p[0]["body"] == "Esguince tobillo"
    sent.clear()
    client.put("/api/profile", headers=auth(A), json={"is_injured": True, "injury_notes": "Sigue igual"})
    assert sent == []


def test_deleting_athlete_removes_her_devices(client, world):
    client.delete(f"/api/athletes/{world['athlete_id']}", headers=auth(world["trainer"]))
    import asyncio
    assert asyncio.run(server.db.push_subscriptions.count_documents({"user_id": world["athlete_id"]})) == 0


# --- Cifrado real: lo que recibe el servicio de notificaciones se puede descifrar en el móvil ---

def test_real_encrypted_push_reaches_push_service(client, world, monkeypatch):
    import http_ece
    import jwt as pyjwt
    from cryptography.hazmat.primitives import serialization
    from cryptography.hazmat.primitives.asymmetric import ec

    received = {}

    class PushService(BaseHTTPRequestHandler):
        def do_POST(self):
            received["headers"] = dict(self.headers)
            received["body"] = self.rfile.read(int(self.headers["Content-Length"]))
            self.send_response(201)
            self.end_headers()

        def log_message(self, *a):
            pass

    httpd = HTTPServer(("127.0.0.1", 0), PushService)
    threading.Thread(target=httpd.handle_request, daemon=True).start()
    monkeypatch.setenv("NO_PROXY", "127.0.0.1,localhost")
    monkeypatch.setenv("no_proxy", "127.0.0.1,localhost")

    # El "móvil": sus claves, como las crea el navegador al suscribirse
    phone_key = ec.generate_private_key(ec.SECP256R1())
    p256dh = base64.urlsafe_b64encode(phone_key.public_key().public_bytes(serialization.Encoding.X962, serialization.PublicFormat.UncompressedPoint)).decode().rstrip("=")
    auth_secret = os.urandom(16)
    endpoint = f"http://127.0.0.1:{httpd.server_port}/push/movil-real"
    import asyncio
    user_id = world["athlete_id"]
    asyncio.run(server.db.push_subscriptions.insert_one({"endpoint": endpoint, "user_id": user_id,
        "keys": {"p256dh": p256dh, "auth": base64.urlsafe_b64encode(auth_secret).decode().rstrip("=")}}))
    asyncio.run(server.db.push_subscriptions.delete_many({"endpoint": {"$in": [ep("movil-ana"), ep("tablet-ana")]}}))

    res = client.post("/api/push/test", headers=auth(world["athlete"]))
    assert res.json()["sent"] == 1, res.text
    httpd.server_close()

    h = {k.lower(): v for k, v in received["headers"].items()}
    assert h["content-encoding"] == "aes128gcm" and int(h["ttl"]) > 0 and h["urgency"] == "high"
    payload = json.loads(http_ece.decrypt(received["body"], private_key=phone_key, auth_secret=auth_secret, version="aes128gcm"))
    assert payload == {"title": "🔔 Notificaciones activadas", "body": "Así te llegarán los avisos de AM Coaching.", "url": "/settings", "tag": "test"}

    # Firma VAPID: hecha con la clave cuya parte pública dio /push/config al móvil
    public_key = client.get("/api/push/config", headers=auth(world["athlete"])).json()["public_key"]
    parts = dict(p.strip().split("=", 1) for p in h["authorization"][len("vapid "):].split(","))
    assert parts["k"] == public_key
    pub = ec.EllipticCurvePublicKey.from_encoded_point(ec.SECP256R1(), base64.urlsafe_b64decode(public_key + "=="))
    claims = pyjwt.decode(parts["t"], pub, algorithms=["ES256"], audience=f"http://127.0.0.1:{httpd.server_port}")
    assert claims["sub"].startswith("mailto:")
