"""Physical tests API endpoint tests"""
import pytest
import uuid
from datetime import datetime, timezone

@pytest.fixture(scope="module")
def test_athlete_for_tests(base_url, api_client, auth_headers):
    """Create a test athlete for physical test API tests"""
    unique_email = f"TEST_tests_athlete_{uuid.uuid4().hex[:8]}@test.com"
    payload = {
        "name": "Physical Test Athlete",
        "email": unique_email,
        "password": "test123",
        "sport": "Track"
    }
    response = api_client.post(
        f"{base_url}/api/athletes",
        json=payload,
        headers=auth_headers
    )
    assert response.status_code == 200
    return response.json()

class TestPhysicalTestsCRUD:
    """Test physical tests creation and management"""

    def test_create_strength_test(self, base_url, api_client, auth_headers, test_athlete_for_tests):
        """Test POST /api/tests - create strength test"""
        payload = {
            "athlete_id": test_athlete_for_tests["id"],
            "test_type": "strength",
            "test_name": "squat_rm",
            "value": 150.0,
            "unit": "kg",
            "date": datetime.now(timezone.utc).strftime('%Y-%m-%d'),
            "notes": "Good form"
        }
        response = api_client.post(
            f"{base_url}/api/tests",
            json=payload,
            headers=auth_headers
        )
        print(f"Create test response: {response.status_code} - {response.text}")
        
        assert response.status_code == 200
        data = response.json()
        assert data["athlete_id"] == test_athlete_for_tests["id"]
        assert data["test_type"] == "strength"
        assert data["test_name"] == "squat_rm"
        assert data["value"] == 150.0
        assert data["unit"] == "kg"
        assert "_id" not in data
        assert "id" in data

    def test_create_plyometric_test(self, base_url, api_client, auth_headers, test_athlete_for_tests):
        """Test POST /api/tests - create plyometric test (CMJ)"""
        payload = {
            "athlete_id": test_athlete_for_tests["id"],
            "test_type": "plyometrics",
            "test_name": "cmj",
            "value": 45.5,
            "unit": "cm",
            "date": datetime.now(timezone.utc).strftime('%Y-%m-%d')
        }
        response = api_client.post(
            f"{base_url}/api/tests",
            json=payload,
            headers=auth_headers
        )
        print(f"Create plyometric test response: {response.status_code} - {response.text}")
        
        assert response.status_code == 200
        data = response.json()
        assert data["test_type"] == "plyometrics"
        assert data["test_name"] == "cmj"
        assert data["value"] == 45.5

    def test_list_tests(self, base_url, api_client, auth_headers):
        """Test GET /api/tests - list tests"""
        response = api_client.get(
            f"{base_url}/api/tests",
            headers=auth_headers
        )
        print(f"List tests response: {response.status_code} - {response.text}")
        
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        for test in data:
            assert "_id" not in test

    def test_list_tests_filtered_by_athlete(self, base_url, api_client, auth_headers, test_athlete_for_tests):
        """Test GET /api/tests with athlete_id filter"""
        response = api_client.get(
            f"{base_url}/api/tests?athlete_id={test_athlete_for_tests['id']}",
            headers=auth_headers
        )
        print(f"List tests filtered response: {response.status_code} - {response.text}")
        
        assert response.status_code == 200
        data = response.json()
        assert isinstance(data, list)
        for test in data:
            assert test["athlete_id"] == test_athlete_for_tests["id"]

    def test_create_test_requires_auth(self, base_url, api_client, test_athlete_for_tests):
        """Test creating test without auth fails"""
        payload = {
            "athlete_id": test_athlete_for_tests["id"],
            "test_type": "strength",
            "test_name": "bench_rm",
            "value": 100.0,
            "unit": "kg",
            "date": "2024-01-01"
        }
        response = api_client.post(f"{base_url}/api/tests", json=payload)
        print(f"Create test no auth response: {response.status_code}")
        
        assert response.status_code in [401, 403]
