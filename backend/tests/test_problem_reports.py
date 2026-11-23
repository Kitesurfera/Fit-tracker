"""Informes de problemas (Ajustes > Informar de un problema).

    pytest tests/test_problem_reports.py
"""
import base64

import pytest

from test_push_notifications import auth, client, ep, sent, server, to, world  # noqa: F401  (fixtures compartidos)

PNG_1PX = "data:image/png;base64," + base64.b64encode(bytes.fromhex(
    "89504e470d0a1a0a0000000d4948445200000001000000010806000000"
    "1f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082")).decode()


@pytest.fixture()
def emails(monkeypatch):
    out = []
    monkeypatch.setattr(server, "send_email_async", lambda *a: out.append(a) or True)
    monkeypatch.setenv("SUPPORT_EMAIL", "soporte@test.com")
    return out


def send(client, token, **kw):
    body = {"category": "bug", "area": "Modo entrenamiento", "description": "El temporizador se para al bloquear el móvil", **kw}
    return client.post("/api/reports", headers=auth(token), json=body)


def test_athlete_report_is_saved_emailed_and_trainer_notified(client, world, sent, emails):
    diag = {"Dispositivo": "Android · Chrome", "Versión": "1.0.0 (entry-abc)", "Errores recientes": ["TypeError: x is undefined"], "pendientes": 0}
    res = send(client, world["athlete"], screenshot=PNG_1PX, diagnostics=diag)
    assert res.status_code == 200, res.text
    r = res.json()
    assert r["status"] == "open" and r["has_screenshot"] and len(r["ref"]) == 6 and r["user_name"] == "Ana" and r["role"] == "athlete"
    assert "data" not in r and "screenshot" not in r  # la imagen va aparte, no en la lista

    # Email a soporte con la captura adjunta y los datos del dispositivo
    (to_addr, subject, body, attachments), = emails
    assert to_addr == "soporte@test.com" and subject.startswith("🐞 [Algo no funciona] Ana:")
    assert "El temporizador se para" in body and "Android · Chrome" in body and "TypeError" in body
    assert attachments[0][0] == f"captura-{r['ref']}.png" and attachments[0][1].startswith(b"\x89PNG")

    # Aviso al móvil del entrenador (no a la deportista)
    p = to(sent, "movil-entrenador")
    assert p[0]["title"] == "🐞 Ana ha informado de un problema" and p[0]["url"] == "/settings?reports=1"
    assert to(sent, "movil-ana") == []

    # El entrenador lo ve en su lista, con la captura; la deportista ve los suyos
    lst = client.get("/api/reports", headers=auth(world["trainer"])).json()
    assert [x["id"] for x in lst] == [r["id"]] and lst[0]["diagnostics"]["Dispositivo"] == "Android · Chrome"
    assert client.get(f"/api/reports/{r['id']}/screenshot", headers=auth(world["trainer"])).json()["data"] == PNG_1PX
    assert [x["id"] for x in client.get("/api/reports", headers=auth(world["athlete"])).json()] == [r["id"]]


def test_without_support_email_it_goes_to_trainer_signup_emails(client, world, emails, monkeypatch):
    monkeypatch.delenv("SUPPORT_EMAIL")
    send(client, world["athlete"])
    assert emails[0][0] == "coach.a@test.com, Coach.B@test.com" and emails[0][3] == []


def test_validation(client, world, emails):
    assert send(client, world["athlete"], description="  corto ").status_code == 400
    assert send(client, world["athlete"], screenshot="data:text/html;base64,PGgxPg==").status_code == 400
    assert send(client, world["athlete"], screenshot="https://evil.com/x.png").status_code == 400
    assert send(client, world["athlete"], screenshot="data:image/png;base64," + "A" * 1_700_000).status_code == 400
    r = send(client, world["athlete"], category="hack", area="x" * 200, diagnostics={f"k{i}": "v" * 900 for i in range(60)}).json()
    assert r["category"] == "other" and len(r["area"]) == 60
    assert len(r["diagnostics"]) == 40 and all(len(v) == 500 for v in r["diagnostics"].values())


def test_rate_limit(client, world, emails, monkeypatch):
    monkeypatch.setattr(server, "REPORT_MAX_PER_HOUR", 2)
    assert send(client, world["athlete"]).status_code == 200
    assert send(client, world["athlete"]).status_code == 200
    assert send(client, world["athlete"]).status_code == 429


def test_trainer_replies_and_resolves_and_athlete_is_notified(client, world, sent, emails):
    rid = send(client, world["athlete"]).json()["id"]
    sent.clear()
    assert client.patch(f"/api/reports/{rid}", headers=auth(world["athlete"]), json={"status": "resolved"}).status_code == 403
    r = client.patch(f"/api/reports/{rid}", headers=auth(world["trainer"]), json={"reply": "Gracias, lo miramos esta semana"}).json()
    assert r["reply"] == "Gracias, lo miramos esta semana" and r["status"] == "open" and r["replied_by"] == "Andre"
    assert to(sent, "movil-ana")[0]["title"] == "💬 Respuesta a tu informe"
    sent.clear()
    r = client.patch(f"/api/reports/{rid}", headers=auth(world["trainer"]), json={"status": "resolved"}).json()
    assert r["status"] == "resolved" and r["resolved_at"]
    assert to(sent, "movil-ana")[0]["title"] == "✅ Tu informe está resuelto"
    sent.clear()
    client.patch(f"/api/reports/{rid}", headers=auth(world["trainer"]), json={"status": "resolved", "reply": "Gracias, lo miramos esta semana"})
    assert sent == []  # sin cambios, sin aviso
    assert client.get("/api/reports", headers=auth(world["athlete"])).json()[0]["status"] == "resolved"


def test_trainer_own_reports_and_privacy(client, world, sent, emails):
    own = send(client, world["trainer"], description="No carga el calendario en el ordenador").json()
    assert own["trainer_id"] == own["user_id"] and to(sent, "movil-entrenador") == []
    other = client.post("/api/auth/register", json={"email": "coach.b@test.com", "password": "secret123", "name": "B"}).json()["token"]
    assert client.get("/api/reports", headers=auth(other)).json() == []
    assert client.get(f"/api/reports/{own['id']}/screenshot", headers=auth(other)).status_code == 404
    assert client.patch(f"/api/reports/{own['id']}", headers=auth(other), json={"status": "resolved"}).status_code == 404
    assert client.delete(f"/api/reports/{own['id']}", headers=auth(other)).status_code == 404
    assert client.get("/api/reports", headers=auth(world["athlete"])).json() == []  # la deportista no ve los del entrenador


def test_delete_report_and_athlete(client, world, emails):
    rid = send(client, world["athlete"], screenshot=PNG_1PX).json()["id"]
    assert client.delete(f"/api/reports/{rid}", headers=auth(world["athlete"])).json() == {"status": "deleted"}
    assert client.get("/api/reports", headers=auth(world["trainer"])).json() == []
    send(client, world["athlete"], screenshot=PNG_1PX)
    client.delete(f"/api/athletes/{world['athlete_id']}", headers=auth(world["trainer"]))
    assert client.get("/api/reports", headers=auth(world["trainer"])).json() == []
    import asyncio
    assert asyncio.run(server.db.problem_report_images.count_documents({})) == 0
