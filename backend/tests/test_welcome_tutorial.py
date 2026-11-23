"""El tutorial de bienvenida se recuerda en el perfil (para no repetirlo en otro dispositivo)."""
from test_push_notifications import auth, client, world  # noqa: F401  (fixtures compartidos)


def test_tutorial_version_is_saved_and_returned_on_login(client, world):
    login = client.post("/api/auth/login", json={"email": "ana@test.com", "password": "athlete123"}).json()
    assert "tutorial_version" not in login["user"]  # aún no lo ha visto: la app se lo mostrará
    assert client.put("/api/profile", headers=auth(world["athlete"]), json={"tutorial_version": 2}).status_code == 200
    login = client.post("/api/auth/login", json={"email": "ana@test.com", "password": "athlete123"}).json()
    assert login["user"]["tutorial_version"] == 2 and login["user"]["gender"] == "Femenino"
