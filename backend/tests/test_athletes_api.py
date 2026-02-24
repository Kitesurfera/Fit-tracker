"""Athletes API endpoint tests"""
import pytest
import uuid

class TestAthletesCRUD:
    """Test athlete creation and management by trainer"""

    def test_create_athlete_success(self, base_url, api_client, auth_headers):
        """Test POST /api/athletes - trainer creates athlete"""
        unique_email = f"TEST_athlete_{uuid.uuid4().hex[:8]}@test.com"
        payload = {
            "name": "Test Athlete",
            "email": unique_email,
            "password": "athlete123",
            "sport": "Football",
            "position": "Forward"
        }
        response = api_client.post(
            f"{base_url}/api/athletes",
            json=payload,
            headers=auth_headers
        )
        print(f"Create athlete response: {response.status_code} - {response.text}")
        
        assert response.status_code == 200
        data = response.json()
        assert data["email"] == unique_email
        assert data["name"] == "Test Athlete"
        assert data["role"] == "athlete"
        assert data["sport"] == "Football"
        assert data["position"] == "Forward"
        assert "password" not in data
        assert "_id" not in data
        assert "id" in data
        assert "trainer_id" in data
        
        # Verify persistence with GET
        athlete_id = data["id"]
        get_response = api_client.get(
            f"{base_url}/api/athletes/{athlete_id}",
            headers=auth_headers
        )
        assert get_response.status_code == 200
        get_data = get_response.json()
        assert get_data["email"] == unique_email

    def test_create_athlete_duplicate_email_fails(self, base_url, api_client, auth_headers, test_trainer_credentials):
        """Test creating athlete with existing email fails"""
        payload = {
            "name": "Duplicate Athlete",
            "email": test_trainer_credentials["email"],
            "password": "athlete123"
        }
        response = api_client.post(
            f"{base_url}/api/athletes",
            json=payload,
            headers=auth_headers
        )
        print(f"Duplicate athlete email response: {response.status_code} - {response.text}")
        
        assert response.status_code == 400

    def test_list_athletes_for_trainer(self, base_url, api_client, auth_headers):
        """Test GET /api/athletes - list trainer's athletes"""
        response = api_client.get(
            f"{base_url}/api/athletes",
            headers=auth_headers
        )
        print(f"List athletes response: {response.status_code} - {response.text}")
        
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        # Verify no password or _id in any athlete
        for athlete in data:
            assert "password" not in athlete
            assert "_id" not in athlete
            assert athlete["role"] == "athlete"

    def test_create_athlete_requires_auth(self, base_url, api_client):
        """Test creating athlete without auth fails"""
        payload = {
            "name": "No Auth Athlete",
            "email": "noauth@test.com",
            "password": "test123"
        }
        response = api_client.post(f"{base_url}/api/athletes", json=payload)
        print(f"Create athlete no auth response: {response.status_code}")
        
        assert response.status_code in [401, 403]
