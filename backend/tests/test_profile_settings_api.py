"""
Test profile and settings endpoints
Features: PUT /api/profile, GET/PUT /api/settings, PUT /api/profile/password
"""
import pytest
import requests
import os

BASE_URL = os.environ.get('EXPO_PUBLIC_BACKEND_URL').rstrip('/')

class TestProfileAPI:
    """Profile update endpoint tests"""

    def test_update_profile_name(self, api_client, auth_headers):
        """Update profile name and verify persistence"""
        update_payload = {"name": "Updated Trainer Name"}
        response = api_client.put(
            f"{BASE_URL}/api/profile",
            json=update_payload,
            headers=auth_headers
        )
        assert response.status_code == 200
        
        updated = response.json()
        assert updated["name"] == "Updated Trainer Name"
        assert "email" in updated

    def test_update_profile_empty_data(self, api_client, auth_headers):
        """Test profile update with no data"""
        response = api_client.put(
            f"{BASE_URL}/api/profile",
            json={},
            headers=auth_headers
        )
        assert response.status_code == 400

    def test_update_profile_unauthorized(self, api_client):
        """Test profile update without auth"""
        response = api_client.put(
            f"{BASE_URL}/api/profile",
            json={"name": "Test"}
        )
        assert response.status_code == 403


class TestSettingsAPI:
    """Settings CRUD endpoint tests"""

    def test_get_settings_default(self, api_client, auth_headers):
        """Get settings returns default values if none exist"""
        response = api_client.get(
            f"{BASE_URL}/api/settings",
            headers=auth_headers
        )
        assert response.status_code == 200
        
        settings = response.json()
        assert "notifications_enabled" in settings
        assert "weight_unit" in settings
        assert "height_unit" in settings
        assert "language" in settings
        assert settings["weight_unit"] in ["kg", "lb"]
        assert settings["height_unit"] in ["cm", "ft"]
        assert settings["language"] in ["es", "en"]

    def test_update_settings_notification(self, api_client, auth_headers):
        """Update notification settings and verify persistence"""
        update_payload = {"notifications_enabled": False}
        response = api_client.put(
            f"{BASE_URL}/api/settings",
            json=update_payload,
            headers=auth_headers
        )
        assert response.status_code == 200
        
        updated = response.json()
        assert updated["notifications_enabled"] == False

        # Verify with GET
        get_response = api_client.get(
            f"{BASE_URL}/api/settings",
            headers=auth_headers
        )
        assert get_response.status_code == 200
        assert get_response.json()["notifications_enabled"] == False

    def test_update_settings_weight_unit(self, api_client, auth_headers):
        """Update weight unit to lb and verify"""
        update_payload = {"weight_unit": "lb"}
        response = api_client.put(
            f"{BASE_URL}/api/settings",
            json=update_payload,
            headers=auth_headers
        )
        assert response.status_code == 200
        assert response.json()["weight_unit"] == "lb"

    def test_update_settings_height_unit(self, api_client, auth_headers):
        """Update height unit to ft and verify"""
        update_payload = {"height_unit": "ft"}
        response = api_client.put(
            f"{BASE_URL}/api/settings",
            json=update_payload,
            headers=auth_headers
        )
        assert response.status_code == 200
        assert response.json()["height_unit"] == "ft"

    def test_update_settings_language(self, api_client, auth_headers):
        """Update language to en and verify"""
        update_payload = {"language": "en"}
        response = api_client.put(
            f"{BASE_URL}/api/settings",
            json=update_payload,
            headers=auth_headers
        )
        assert response.status_code == 200
        assert response.json()["language"] == "en"

    def test_update_settings_multiple_fields(self, api_client, auth_headers):
        """Update multiple settings at once"""
        update_payload = {
            "notifications_workouts": True,
            "notifications_tests": True,
            "weight_unit": "kg",
            "language": "es"
        }
        response = api_client.put(
            f"{BASE_URL}/api/settings",
            json=update_payload,
            headers=auth_headers
        )
        assert response.status_code == 200
        
        updated = response.json()
        assert updated["notifications_workouts"] == True
        assert updated["notifications_tests"] == True
        assert updated["weight_unit"] == "kg"
        assert updated["language"] == "es"

    def test_update_settings_unauthorized(self, api_client):
        """Test settings update without auth"""
        response = api_client.put(
            f"{BASE_URL}/api/settings",
            json={"language": "en"}
        )
        assert response.status_code == 403


class TestPasswordChange:
    """Password change endpoint tests"""

    def test_change_password_success(self, api_client, auth_headers, test_trainer_credentials):
        """Change password and verify new password works"""
        # Change password
        change_payload = {
            "current_password": test_trainer_credentials["password"],
            "new_password": "newpass123"
        }
        response = api_client.put(
            f"{BASE_URL}/api/profile/password",
            json=change_payload,
            headers=auth_headers
        )
        assert response.status_code == 200
        assert "message" in response.json()

        # Verify new password works
        login_response = api_client.post(
            f"{BASE_URL}/api/auth/login",
            json={
                "email": test_trainer_credentials["email"],
                "password": "newpass123"
            }
        )
        assert login_response.status_code == 200
        assert "token" in login_response.json()

        # Change back to original password
        new_token = login_response.json()["token"]
        restore_response = api_client.put(
            f"{BASE_URL}/api/profile/password",
            json={
                "current_password": "newpass123",
                "new_password": test_trainer_credentials["password"]
            },
            headers={"Authorization": f"Bearer {new_token}"}
        )
        assert restore_response.status_code == 200

    def test_change_password_wrong_current(self, api_client, auth_headers):
        """Test password change with wrong current password"""
        change_payload = {
            "current_password": "wrongpassword",
            "new_password": "newpass123"
        }
        response = api_client.put(
            f"{BASE_URL}/api/profile/password",
            json=change_payload,
            headers=auth_headers
        )
        assert response.status_code == 400

    def test_change_password_unauthorized(self, api_client):
        """Test password change without auth"""
        response = api_client.put(
            f"{BASE_URL}/api/profile/password",
            json={
                "current_password": "test",
                "new_password": "new"
            }
        )
        assert response.status_code == 403
