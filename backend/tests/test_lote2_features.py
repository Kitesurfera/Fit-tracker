"""
Test file for Lote 2 features:
1. File upload/download endpoints (object storage integration)
2. Workout observations field (POST and GET)
3. WorkoutUpdate model with observations
"""
import pytest
import requests
import os
import io

BASE_URL = os.environ.get('REACT_APP_BACKEND_URL', '').rstrip('/')

# Test credentials
TRAINER_EMAIL = "trainer_lote1@test.com"
TRAINER_PASSWORD = "test1234"
ATHLETE_EMAIL = "athlete_lote1@test.com"
ATHLETE_PASSWORD = "test1234"
ATHLETE_ID = "a8d2b212-bb5c-41f7-941f-ed0299c61ec1"


class TestAuth:
    """Authentication helpers"""
    
    @pytest.fixture(scope="class")
    def trainer_token(self):
        """Get trainer auth token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": TRAINER_EMAIL,
            "password": TRAINER_PASSWORD
        })
        assert response.status_code == 200, f"Trainer login failed: {response.text}"
        return response.json()["token"]
    
    @pytest.fixture(scope="class")
    def athlete_token(self):
        """Get athlete auth token"""
        response = requests.post(f"{BASE_URL}/api/auth/login", json={
            "email": ATHLETE_EMAIL,
            "password": ATHLETE_PASSWORD
        })
        assert response.status_code == 200, f"Athlete login failed: {response.text}"
        return response.json()["token"]


class TestFileUploadDownload(TestAuth):
    """Test file upload and download endpoints (object storage integration)"""
    
    def test_upload_file_requires_auth(self):
        """Test that upload endpoint requires authentication"""
        # Create a fake image file
        files = {'file': ('test.jpg', b'\xff\xd8\xff\xe0\x00\x10JFIF\x00\x01\x01', 'image/jpeg')}
        response = requests.post(f"{BASE_URL}/api/upload", files=files)
        assert response.status_code == 403 or response.status_code == 401, "Upload should require auth"
    
    def test_upload_file_success(self, trainer_token):
        """Test file upload returns storage_path"""
        headers = {"Authorization": f"Bearer {trainer_token}"}
        # Create a minimal valid JPEG header
        jpeg_content = b'\xff\xd8\xff\xe0\x00\x10JFIF\x00\x01\x01\x00\x00\x01\x00\x01\x00\x00\xff\xdb\x00C'
        files = {'file': ('test_upload.jpg', jpeg_content, 'image/jpeg')}
        response = requests.post(f"{BASE_URL}/api/upload", headers=headers, files=files)
        assert response.status_code == 200, f"Upload failed: {response.text}"
        data = response.json()
        # Verify response structure
        assert "storage_path" in data, "Response should have storage_path"
        assert "file_id" in data, "Response should have file_id"
        assert data["storage_path"], "storage_path should not be empty"
        # Store path for download test
        TestFileUploadDownload.uploaded_path = data["storage_path"]
        print(f"✓ File uploaded to: {data['storage_path']}")
    
    def test_upload_file_rejects_invalid_type(self, trainer_token):
        """Test that upload rejects non-image files"""
        headers = {"Authorization": f"Bearer {trainer_token}"}
        files = {'file': ('test.pdf', b'%PDF-1.4 test content', 'application/pdf')}
        response = requests.post(f"{BASE_URL}/api/upload", headers=headers, files=files)
        assert response.status_code == 400, "Should reject non-image files"
        assert "Tipo de archivo no permitido" in response.json().get("detail", "")
    
    def test_download_file_requires_auth(self):
        """Test that download endpoint requires authentication"""
        # Skip if no file was uploaded
        path = getattr(TestFileUploadDownload, 'uploaded_path', None)
        if not path:
            pytest.skip("No file uploaded to test download")
        response = requests.get(f"{BASE_URL}/api/files/{path}")
        assert response.status_code == 401, "Download should require auth"
    
    def test_download_file_with_query_token(self, trainer_token):
        """Test file download with auth token in query parameter"""
        path = getattr(TestFileUploadDownload, 'uploaded_path', None)
        if not path:
            pytest.skip("No file uploaded to test download")
        response = requests.get(f"{BASE_URL}/api/files/{path}?auth={trainer_token}")
        assert response.status_code == 200, f"Download failed: {response.status_code}"
        assert len(response.content) > 0, "Downloaded file should have content"
        print(f"✓ File downloaded successfully ({len(response.content)} bytes)")
    
    def test_download_file_with_header_token(self, trainer_token):
        """Test file download with auth token in Authorization header"""
        path = getattr(TestFileUploadDownload, 'uploaded_path', None)
        if not path:
            pytest.skip("No file uploaded to test download")
        headers = {"Authorization": f"Bearer {trainer_token}"}
        response = requests.get(f"{BASE_URL}/api/files/{path}", headers=headers)
        assert response.status_code == 200, f"Download failed: {response.status_code}"


class TestWorkoutObservations(TestAuth):
    """Test workout observations field for post-workout notes"""
    
    @pytest.fixture(scope="class")
    def test_workout_id(self, trainer_token):
        """Create a test workout to update with observations"""
        headers = {"Authorization": f"Bearer {trainer_token}", "Content-Type": "application/json"}
        workout_data = {
            "athlete_id": ATHLETE_ID,
            "date": "2026-01-22",
            "title": "TEST_Lote2_Observations_Test",
            "exercises": [
                {"name": "Sentadilla", "sets": "3", "reps": "10", "weight": "80", "rest": "60"},
                {"name": "Press banca", "sets": "3", "reps": "8", "weight": "60", "rest": "90"}
            ],
            "notes": "Test workout for observations feature"
        }
        response = requests.post(f"{BASE_URL}/api/workouts", headers=headers, json=workout_data)
        assert response.status_code == 200, f"Create workout failed: {response.text}"
        data = response.json()
        assert "id" in data, "Response should have workout id"
        print(f"✓ Test workout created: {data['id']}")
        return data["id"]
    
    def test_update_workout_with_observations(self, athlete_token, test_workout_id):
        """Test that workout can be updated with observations field"""
        headers = {"Authorization": f"Bearer {athlete_token}", "Content-Type": "application/json"}
        observations_text = "Me senti muy bien durante el entrenamiento. Buena energia."
        update_data = {
            "completed": True,
            "completion_data": {
                "exercise_results": [
                    {"exercise_index": 0, "name": "Sentadilla", "total_sets": 3, "completed_sets": 3, "skipped_sets": 0},
                    {"exercise_index": 1, "name": "Press banca", "total_sets": 3, "completed_sets": 2, "skipped_sets": 1}
                ]
            },
            "observations": observations_text
        }
        response = requests.put(f"{BASE_URL}/api/workouts/{test_workout_id}", headers=headers, json=update_data)
        assert response.status_code == 200, f"Update workout failed: {response.text}"
        data = response.json()
        # Verify observations saved
        assert data.get("observations") == observations_text, "Observations should be saved"
        assert data.get("completed") == True, "Workout should be marked completed"
        print(f"✓ Observations saved: '{observations_text[:50]}...'")
    
    def test_get_workout_returns_observations(self, trainer_token, test_workout_id):
        """Test that GET /api/workouts returns observations field"""
        headers = {"Authorization": f"Bearer {trainer_token}"}
        response = requests.get(f"{BASE_URL}/api/workouts/{test_workout_id}", headers=headers)
        assert response.status_code == 200, f"Get workout failed: {response.text}"
        data = response.json()
        # Verify observations is returned
        assert "observations" in data, "Response should include observations field"
        assert data["observations"], "Observations should not be empty"
        print(f"✓ Observations retrieved: '{data['observations'][:50]}...'")
    
    def test_list_workouts_returns_observations(self, trainer_token):
        """Test that GET /api/workouts (list) returns observations for completed workouts"""
        headers = {"Authorization": f"Bearer {trainer_token}"}
        response = requests.get(f"{BASE_URL}/api/workouts?athlete_id={ATHLETE_ID}", headers=headers)
        assert response.status_code == 200, f"List workouts failed: {response.text}"
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        # Find our test workout
        test_workout = next((w for w in data if "Lote2_Observations" in w.get("title", "")), None)
        if test_workout:
            assert "observations" in test_workout, "List should include observations field"
            print(f"✓ Observations found in workout list: '{test_workout.get('observations', '')[:50]}'")


class TestRestTimerWorkoutSetup(TestAuth):
    """Test workout with rest time for rest timer feature verification"""
    
    def test_create_workout_with_rest_time(self, trainer_token):
        """Verify workout with rest time can be created for timer testing"""
        headers = {"Authorization": f"Bearer {trainer_token}", "Content-Type": "application/json"}
        workout_data = {
            "athlete_id": ATHLETE_ID,
            "date": "2026-01-22",
            "title": "TEST_RestTimer_Workout",
            "exercises": [
                {"name": "Sentadilla con descanso", "sets": "4", "reps": "8", "weight": "100", "rest": "90"},
                {"name": "Peso muerto", "sets": "3", "reps": "6", "weight": "120", "rest": "120"}
            ],
            "notes": "Workout for rest timer testing"
        }
        response = requests.post(f"{BASE_URL}/api/workouts", headers=headers, json=workout_data)
        assert response.status_code == 200, f"Create workout failed: {response.text}"
        data = response.json()
        # Verify rest time is saved
        exercises = data.get("exercises", [])
        assert len(exercises) >= 2, "Should have at least 2 exercises"
        assert exercises[0].get("rest") == "90", "First exercise should have rest=90"
        assert exercises[1].get("rest") == "120", "Second exercise should have rest=120"
        print(f"✓ Workout created with rest times: {[ex.get('rest') for ex in exercises]}")
    
    def test_get_athlete_workouts_for_timer_test(self, athlete_token):
        """Verify athlete can see workouts for training mode"""
        headers = {"Authorization": f"Bearer {athlete_token}"}
        response = requests.get(f"{BASE_URL}/api/workouts", headers=headers)
        assert response.status_code == 200, f"Get workouts failed: {response.text}"
        data = response.json()
        assert isinstance(data, list), "Response should be a list"
        # Find workout with rest time
        timer_workouts = [w for w in data if any(ex.get("rest") for ex in w.get("exercises", []))]
        assert len(timer_workouts) > 0, "Should have workouts with rest time"
        print(f"✓ Found {len(timer_workouts)} workouts with rest time configured")


class TestCleanup(TestAuth):
    """Cleanup test data"""
    
    def test_cleanup_test_workouts(self, trainer_token):
        """Delete TEST_ prefixed workouts"""
        headers = {"Authorization": f"Bearer {trainer_token}"}
        response = requests.get(f"{BASE_URL}/api/workouts?athlete_id={ATHLETE_ID}", headers=headers)
        if response.status_code == 200:
            workouts = response.json()
            for w in workouts:
                if w.get("title", "").startswith("TEST_"):
                    del_resp = requests.delete(f"{BASE_URL}/api/workouts/{w['id']}", headers=headers)
                    if del_resp.status_code == 200:
                        print(f"✓ Deleted test workout: {w['title']}")
        print("✓ Cleanup complete")


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
