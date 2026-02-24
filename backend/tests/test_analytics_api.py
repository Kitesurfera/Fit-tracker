"""Analytics API endpoint tests"""
import pytest
import uuid
from datetime import datetime, timezone

@pytest.fixture(scope="module")
def athlete_with_data(base_url, api_client, auth_headers):
    """Create athlete with workouts and tests for analytics"""
    # Create athlete
    unique_email = f"TEST_analytics_athlete_{uuid.uuid4().hex[:8]}@test.com"
    athlete_payload = {
        "name": "Analytics Athlete",
        "email": unique_email,
        "password": "test123",
        "sport": "CrossFit"
    }
    athlete_response = api_client.post(
        f"{base_url}/api/athletes",
        json=athlete_payload,
        headers=auth_headers
    )
    assert athlete_response.status_code == 200
    athlete = athlete_response.json()
    
    # Create workout
    workout_payload = {
        "athlete_id": athlete["id"],
        "date": datetime.now(timezone.utc).strftime('%Y-%m-%d'),
        "title": "Test Workout",
        "exercises": [{"name": "Squats", "sets": "3", "reps": "10"}]
    }
    api_client.post(
        f"{base_url}/api/workouts",
        json=workout_payload,
        headers=auth_headers
    )
    
    # Create test
    test_payload = {
        "athlete_id": athlete["id"],
        "test_type": "strength",
        "test_name": "squat_rm",
        "value": 140.0,
        "unit": "kg",
        "date": datetime.now(timezone.utc).strftime('%Y-%m-%d')
    }
    api_client.post(
        f"{base_url}/api/tests",
        json=test_payload,
        headers=auth_headers
    )
    
    return athlete

class TestAnalyticsAPI:
    """Test analytics endpoints"""

    def test_get_analytics_summary(self, base_url, api_client, auth_headers, athlete_with_data):
        """Test GET /api/analytics/summary - get analytics"""
        response = api_client.get(
            f"{base_url}/api/analytics/summary?athlete_id={athlete_with_data['id']}",
            headers=auth_headers
        )
        print(f"Analytics summary response: {response.status_code} - {response.text}")
        
        assert response.status_code == 200
        data = response.json()
        assert "total_workouts" in data
        assert "completed_workouts" in data
        assert "total_tests" in data
        assert "latest_tests" in data
        assert "week_workouts" in data
        assert "completion_rate" in data
        assert data["total_workouts"] >= 0
        assert data["total_tests"] >= 0

    def test_get_analytics_summary_requires_auth(self, base_url, api_client, athlete_with_data):
        """Test analytics requires authentication"""
        response = api_client.get(
            f"{base_url}/api/analytics/summary?athlete_id={athlete_with_data['id']}"
        )
        print(f"Analytics no auth response: {response.status_code}")
        
        assert response.status_code in [401, 403]
