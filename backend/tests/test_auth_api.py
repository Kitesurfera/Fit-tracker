"""Authentication API endpoint tests"""
import pytest
import requests
import uuid

class TestAuthRegister:
    """Test POST /api/auth/register - trainer registration"""

    def test_register_new_trainer_success(self, base_url, api_client):
        """Test successful trainer registration"""
        unique_email = f"TEST_trainer_{uuid.uuid4().hex[:8]}@test.com"
        payload = {
            "name": "Test Trainer",
            "email": unique_email,
            "password": "test123",
            "role": "trainer"
        }
        response = api_client.post(f"{base_url}/api/auth/register", json=payload)
        print(f"Register response: {response.status_code} - {response.text}")
        
        assert response.status_code == 200
        data = response.json()
        assert "token" in data
        assert "user" in data
        assert data["user"]["email"] == unique_email
        assert data["user"]["name"] == "Test Trainer"
        assert data["user"]["role"] == "trainer"
        assert "password" not in data["user"]
        assert "_id" not in data["user"]

    def test_register_duplicate_email_fails(self, base_url, api_client, test_trainer_credentials):
        """Test registration with existing email fails"""
        payload = {
            "name": "Duplicate Trainer",
            "email": test_trainer_credentials["email"],
            "password": "test123"
        }
        response = api_client.post(f"{base_url}/api/auth/register", json=payload)
        print(f"Duplicate register response: {response.status_code} - {response.text}")
        
        assert response.status_code == 400
        data = response.json()
        assert "detail" in data
        assert "already registered" in data["detail"].lower()

class TestAuthLogin:
    """Test POST /api/auth/login - login with valid/invalid credentials"""

    def test_login_valid_credentials(self, base_url, api_client, test_trainer_credentials):
        """Test login with valid credentials"""
        response = api_client.post(
            f"{base_url}/api/auth/login",
            json=test_trainer_credentials
        )
        print(f"Login response: {response.status_code} - {response.text}")
        
        assert response.status_code == 200
        data = response.json()
        assert "token" in data
        assert "user" in data
        assert data["user"]["email"] == test_trainer_credentials["email"]
        assert "password" not in data["user"]

    def test_login_invalid_password(self, base_url, api_client, test_trainer_credentials):
        """Test login with wrong password"""
        payload = {
            "email": test_trainer_credentials["email"],
            "password": "wrongpassword"
        }
        response = api_client.post(f"{base_url}/api/auth/login", json=payload)
        print(f"Invalid password response: {response.status_code} - {response.text}")
        
        assert response.status_code == 401
        data = response.json()
        assert "detail" in data

    def test_login_nonexistent_user(self, base_url, api_client):
        """Test login with non-existent email"""
        payload = {
            "email": "nonexistent@test.com",
            "password": "test123"
        }
        response = api_client.post(f"{base_url}/api/auth/login", json=payload)
        print(f"Nonexistent user response: {response.status_code} - {response.text}")
        
        assert response.status_code == 401

class TestAuthMe:
    """Test GET /api/auth/me - get current user with token"""

    def test_get_current_user_with_valid_token(self, base_url, api_client, trainer_token, test_trainer_credentials):
        """Test /api/auth/me with valid token"""
        headers = {"Authorization": f"Bearer {trainer_token}"}
        response = api_client.get(f"{base_url}/api/auth/me", headers=headers)
        print(f"Auth me response: {response.status_code} - {response.text}")
        
        assert response.status_code == 200
        data = response.json()
        assert data["email"] == test_trainer_credentials["email"]
        assert data["role"] == "trainer"
        assert "password" not in data
        assert "_id" not in data

    def test_get_current_user_without_token(self, base_url, api_client):
        """Test /api/auth/me without authorization header"""
        response = api_client.get(f"{base_url}/api/auth/me")
        print(f"Auth me no token response: {response.status_code} - {response.text}")
        
        assert response.status_code == 403

    def test_get_current_user_with_invalid_token(self, base_url, api_client):
        """Test /api/auth/me with invalid token"""
        headers = {"Authorization": "Bearer invalid_token_here"}
        response = api_client.get(f"{base_url}/api/auth/me", headers=headers)
        print(f"Auth me invalid token response: {response.status_code} - {response.text}")
        
        assert response.status_code == 401
