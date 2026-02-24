import pytest
import requests
import os

@pytest.fixture(scope="session")
def base_url():
    """Get base URL from environment variable"""
    url = os.environ.get('EXPO_PUBLIC_BACKEND_URL')
    if not url:
        pytest.fail("EXPO_PUBLIC_BACKEND_URL not set in environment")
    return url.rstrip('/')

@pytest.fixture(scope="session")
def api_client():
    """Create requests session for API calls"""
    session = requests.Session()
    session.headers.update({"Content-Type": "application/json"})
    return session

@pytest.fixture(scope="session")
def test_trainer_credentials():
    """Test trainer account credentials"""
    return {
        "email": "coach@test.com",
        "password": "test123"
    }

@pytest.fixture(scope="session")
def trainer_token(base_url, api_client, test_trainer_credentials):
    """Login as test trainer and return token"""
    response = api_client.post(
        f"{base_url}/api/auth/login",
        json=test_trainer_credentials
    )
    if response.status_code != 200:
        pytest.fail(f"Failed to login test trainer: {response.status_code} - {response.text}")
    data = response.json()
    return data.get('token')

@pytest.fixture(scope="session")
def auth_headers(trainer_token):
    """Return authorization headers with trainer token"""
    return {"Authorization": f"Bearer {trainer_token}"}
