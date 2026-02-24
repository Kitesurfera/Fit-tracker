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


class TestCSVWorkouts:
    """Test CSV template and upload functionality"""

    def test_csv_template_download(self, base_url, api_client):
        """Test GET /api/workouts/csv-template returns valid CSV"""
        response = api_client.get(f"{base_url}/api/workouts/csv-template")
        print(f"CSV template response: {response.status_code}")
        
        assert response.status_code == 200
        assert response.headers.get('content-type') == 'text/csv; charset=utf-8'
        
        # Check CSV content has correct headers
        content = response.text
        lines = content.strip().split('\n')
        assert len(lines) >= 2  # At least header + 1 data row
        
        # Verify header row has correct columns
        header = lines[0]
        assert 'dia' in header
        assert 'ejercicio' in header
        assert 'repeticiones' in header
        assert 'series' in header
        print(f"CSV template header: {header}")
        print(f"CSV template has {len(lines)} lines")

    def test_csv_upload_groups_by_date(self, base_url, api_client, auth_headers, test_athlete):
        """Test POST /api/workouts/csv groups exercises by date into separate workouts"""
        import io
        
        # Create CSV content with exercises on different dates
        csv_content = """dia,ejercicio,repeticiones,series
2026-02-24,Sentadilla,8,4
2026-02-24,Press banca,10,3
2026-02-25,Peso muerto,6,4
2026-02-25,Zancadas,12,3"""
        
        # Create file-like object
        files = {
            'file': ('test_workout.csv', io.StringIO(csv_content), 'text/csv')
        }
        
        # Upload CSV (need to handle multipart form data)
        import requests
        session = requests.Session()
        session.headers.update(auth_headers)
        
        response = session.post(
            f"{base_url}/api/workouts/csv?athlete_id={test_athlete['id']}",
            files={'file': ('test.csv', csv_content, 'text/csv')}
        )
        print(f"CSV upload response: {response.status_code} - {response.text}")
        
        assert response.status_code == 200
        data = response.json()
        
        # Should create 2 workouts (one for each date)
        assert "count" in data
        assert data["count"] == 2
        assert "workouts" in data
        assert len(data["workouts"]) == 2
        
        # Verify workouts are grouped by date
        workouts = data["workouts"]
        dates = [w["date"] for w in workouts]
        assert "2026-02-24" in dates
        assert "2026-02-25" in dates
        
        # Verify exercises are grouped correctly
        workout_24 = next(w for w in workouts if w["date"] == "2026-02-24")
        workout_25 = next(w for w in workouts if w["date"] == "2026-02-25")
        
        assert len(workout_24["exercises"]) == 2
        assert len(workout_25["exercises"]) == 2
        
        # Verify exercise data structure
        ex1 = workout_24["exercises"][0]
        assert ex1["name"] == "Sentadilla"
        assert ex1["reps"] == "8"
        assert ex1["sets"] == "4"
        
        # Verify persistence - check GET endpoint
        workout_id = workout_24["id"]
        get_response = api_client.get(
            f"{base_url}/api/workouts/{workout_id}",
            headers=auth_headers
        )
        assert get_response.status_code == 200
        retrieved = get_response.json()
        assert retrieved["date"] == "2026-02-24"
        assert len(retrieved["exercises"]) == 2

    def test_csv_upload_requires_auth(self, base_url, test_athlete):
        """Test CSV upload without auth fails"""
        import requests
        csv_content = "dia,ejercicio,repeticiones,series\n2026-01-01,Test,10,3"
        
        response = requests.post(
            f"{base_url}/api/workouts/csv?athlete_id={test_athlete['id']}",
            files={'file': ('test.csv', csv_content, 'text/csv')}
        )
        print(f"CSV upload no auth response: {response.status_code}")
        
        assert response.status_code in [401, 403]
