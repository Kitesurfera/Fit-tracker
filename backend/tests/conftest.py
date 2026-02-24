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
def test_trainer_credentials(base_url, api_client):
    """Create and return fresh test trainer account credentials"""
    import uuid
    unique_email = f"TEST_trainer_{uuid.uuid4().hex[:8]}@test.com"
    credentials = {
        "email": unique_email,
        "password": "test123",
        "name": "Test Trainer"
    }
    
    # Try to register new trainer
    response = api_client.post(
        f"{base_url}/api/auth/register",
        json=credentials
    )
    
    if response.status_code == 200:
        print(f"Created fresh trainer account: {unique_email}")
    elif response.status_code == 400 and "already registered" in response.text.lower():
        print(f"Trainer account already exists: {unique_email}")
    else:
        pytest.fail(f"Failed to create trainer: {response.status_code} - {response.text}")
    
    return {
        "email": credentials["email"],
        "password": credentials["password"]
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
