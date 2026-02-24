"""Workouts API endpoint tests"""
import pytest
import uuid
from datetime import datetime, timezone

@pytest.fixture(scope="module")
def test_athlete(base_url, api_client, auth_headers):
    """Create a test athlete for workout tests"""
    unique_email = f"TEST_workout_athlete_{uuid.uuid4().hex[:8]}@test.com"
    payload = {
        "name": "Workout Test Athlete",
        "email": unique_email,
        "password": "test123",
        "sport": "Basketball"
    }
    response = api_client.post(
        f"{base_url}/api/athletes",
        json=payload,
        headers=auth_headers
    )
    assert response.status_code == 200
    return response.json()

class TestWorkoutsCRUD:
    """Test workout creation and management"""

    def test_create_workout_success(self, base_url, api_client, auth_headers, test_athlete):
        """Test POST /api/workouts - create workout for athlete"""
        payload = {
            "athlete_id": test_athlete["id"],
            "date": datetime.now(timezone.utc).strftime('%Y-%m-%d'),
            "title": "Upper Body Strength",
            "exercises": [
                {"name": "Bench Press", "sets": "3", "reps": "8", "weight": "80kg"},
                {"name": "Pull Ups", "sets": "3", "reps": "10", "weight": "bodyweight"}
            ],
            "notes": "Focus on form"
        }
        response = api_client.post(
            f"{base_url}/api/workouts",
            json=payload,
            headers=auth_headers
        )
        print(f"Create workout response: {response.status_code} - {response.text}")
        
        assert response.status_code == 200
        data = response.json()
        assert data["athlete_id"] == test_athlete["id"]
        assert data["title"] == "Upper Body Strength"
        assert len(data["exercises"]) == 2
        assert data["completed"] == False
        assert "_id" not in data
        assert "id" in data
        
        # Verify persistence with GET
        workout_id = data["id"]
        get_response = api_client.get(
            f"{base_url}/api/workouts/{workout_id}",
            headers=auth_headers
        )
        assert get_response.status_code == 200

    def test_list_workouts(self, base_url, api_client, auth_headers):
        """Test GET /api/workouts - list workouts"""
        response = api_client.get(
            f"{base_url}/api/workouts",
            headers=auth_headers
        )
        print(f"List workouts response: {response.status_code} - {response.text}")
        
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        for workout in data:
            assert "_id" not in workout

    def test_update_workout_complete(self, base_url, api_client, auth_headers, test_athlete):
        """Test PUT /api/workouts/{id} - update workout to completed"""
        # First create a workout
        create_payload = {
            "athlete_id": test_athlete["id"],
            "date": datetime.now(timezone.utc).strftime('%Y-%m-%d'),
            "title": "Leg Day",
            "exercises": [{"name": "Squats", "sets": "4", "reps": "10", "weight": "100kg"}]
        }
        create_response = api_client.post(
            f"{base_url}/api/workouts",
            json=create_payload,
            headers=auth_headers
        )
        assert create_response.status_code == 200
        workout = create_response.json()
        workout_id = workout["id"]
        
        # Now update to completed
        update_payload = {"completed": True}
        response = api_client.put(
            f"{base_url}/api/workouts/{workout_id}",
            json=update_payload,
            headers=auth_headers
        )
        print(f"Update workout response: {response.status_code} - {response.text}")
        
        assert response.status_code == 200
        data = response.json()
        assert data["completed"] == True
        assert data["id"] == workout_id
        
        # Verify persistence with GET
        get_response = api_client.get(
            f"{base_url}/api/workouts/{workout_id}",
            headers=auth_headers
        )
        assert get_response.status_code == 200
        assert get_response.json()["completed"] == True

    def test_create_workout_requires_auth(self, base_url, api_client, test_athlete):
        """Test creating workout without auth fails"""
        payload = {
            "athlete_id": test_athlete["id"],
            "date": "2024-01-01",
            "title": "No Auth Workout",
            "exercises": []
        }
        response = api_client.post(f"{base_url}/api/workouts", json=payload)
        print(f"Create workout no auth response: {response.status_code}")
        
        assert response.status_code in [401, 403]
