"""
Lote 1 Feature Tests:
1. Exercise notes (exercise_notes) field in workouts
2. Exercise reordering support in edit-workout
3. Physical tests CRUD: update (PUT /api/tests/{id}) and delete (DELETE /api/tests/{id})
4. Bilateral tests with value_left/value_right
"""
import pytest
import uuid
from datetime import datetime, timezone


@pytest.fixture(scope="module")
def lote1_athlete(base_url, api_client, auth_headers):
    """Create a test athlete for Lote 1 feature tests"""
    unique_email = f"TEST_lote1_athlete_{uuid.uuid4().hex[:8]}@test.com"
    payload = {
        "name": "Lote1 Test Athlete",
        "email": unique_email,
        "password": "test123",
        "sport": "CrossFit"
    }
    response = api_client.post(
        f"{base_url}/api/athletes",
        json=payload,
        headers=auth_headers
    )
    assert response.status_code == 200
    return response.json()


class TestExerciseNotesField:
    """Tests for exercise_notes field in workouts (Feature 1)"""

    def test_create_workout_with_exercise_notes(self, base_url, api_client, auth_headers, lote1_athlete):
        """POST /api/workouts - workout with exercise_notes field in exercises"""
        payload = {
            "athlete_id": lote1_athlete["id"],
            "date": datetime.now(timezone.utc).strftime('%Y-%m-%d'),
            "title": "Test Workout with Notes",
            "exercises": [
                {
                    "name": "Sentadilla",
                    "sets": "4",
                    "reps": "8",
                    "weight": "100",
                    "rest": "90",
                    "video_url": "https://youtube.com/watch?v=example",
                    "exercise_notes": "Bajar hasta paralelo, mantener espalda recta"
                },
                {
                    "name": "Press banca",
                    "sets": "3",
                    "reps": "10",
                    "weight": "80",
                    "rest": "60",
                    "video_url": "",
                    "exercise_notes": "Agarre medio, codos a 45 grados"
                }
            ],
            "notes": "Sesion de fuerza"
        }
        response = api_client.post(
            f"{base_url}/api/workouts",
            json=payload,
            headers=auth_headers
        )
        print(f"Create workout with exercise_notes: {response.status_code}")
        
        assert response.status_code == 200
        data = response.json()
        assert "id" in data
        assert "_id" not in data
        assert len(data["exercises"]) == 2
        
        # Verify exercise_notes are preserved
        assert data["exercises"][0]["exercise_notes"] == "Bajar hasta paralelo, mantener espalda recta"
        assert data["exercises"][1]["exercise_notes"] == "Agarre medio, codos a 45 grados"
        
        # Verify persistence with GET
        workout_id = data["id"]
        get_response = api_client.get(
            f"{base_url}/api/workouts/{workout_id}",
            headers=auth_headers
        )
        assert get_response.status_code == 200
        fetched = get_response.json()
        assert fetched["exercises"][0]["exercise_notes"] == "Bajar hasta paralelo, mantener espalda recta"
        
        return data

    def test_update_workout_preserves_exercise_notes(self, base_url, api_client, auth_headers, lote1_athlete):
        """PUT /api/workouts/{id} - updating workout preserves exercise_notes"""
        # Create workout first
        create_payload = {
            "athlete_id": lote1_athlete["id"],
            "date": datetime.now(timezone.utc).strftime('%Y-%m-%d'),
            "title": "Update Test",
            "exercises": [
                {
                    "name": "Peso muerto",
                    "sets": "5",
                    "reps": "5",
                    "exercise_notes": "Cadenas y tiron inicial"
                }
            ]
        }
        create_response = api_client.post(
            f"{base_url}/api/workouts",
            json=create_payload,
            headers=auth_headers
        )
        assert create_response.status_code == 200
        workout = create_response.json()
        workout_id = workout["id"]
        
        # Update workout with modified exercise_notes
        update_payload = {
            "title": "Updated Title",
            "exercises": [
                {
                    "name": "Peso muerto",
                    "sets": "5",
                    "reps": "5",
                    "exercise_notes": "Nota actualizada: Cadenas, tiron, lockout"
                },
                {
                    "name": "Zancadas",
                    "sets": "3",
                    "reps": "12",
                    "exercise_notes": "Nuevo ejercicio con nota"
                }
            ]
        }
        update_response = api_client.put(
            f"{base_url}/api/workouts/{workout_id}",
            json=update_payload,
            headers=auth_headers
        )
        print(f"Update workout response: {update_response.status_code}")
        
        assert update_response.status_code == 200
        updated = update_response.json()
        assert updated["title"] == "Updated Title"
        assert len(updated["exercises"]) == 2
        assert updated["exercises"][0]["exercise_notes"] == "Nota actualizada: Cadenas, tiron, lockout"
        assert updated["exercises"][1]["exercise_notes"] == "Nuevo ejercicio con nota"
        
        # Verify persistence
        get_response = api_client.get(
            f"{base_url}/api/workouts/{workout_id}",
            headers=auth_headers
        )
        assert get_response.status_code == 200
        fetched = get_response.json()
        assert fetched["exercises"][0]["exercise_notes"] == "Nota actualizada: Cadenas, tiron, lockout"


class TestExerciseReordering:
    """Tests for exercise reordering in workouts (Feature 2)"""

    def test_update_workout_reorders_exercises(self, base_url, api_client, auth_headers, lote1_athlete):
        """PUT /api/workouts/{id} - reorder exercises array"""
        # Create workout with exercises in order A, B, C
        create_payload = {
            "athlete_id": lote1_athlete["id"],
            "date": datetime.now(timezone.utc).strftime('%Y-%m-%d'),
            "title": "Reorder Test",
            "exercises": [
                {"name": "Ejercicio A", "sets": "3", "reps": "10"},
                {"name": "Ejercicio B", "sets": "3", "reps": "10"},
                {"name": "Ejercicio C", "sets": "3", "reps": "10"}
            ]
        }
        create_response = api_client.post(
            f"{base_url}/api/workouts",
            json=create_payload,
            headers=auth_headers
        )
        assert create_response.status_code == 200
        workout = create_response.json()
        workout_id = workout["id"]
        
        # Reorder to C, A, B
        update_payload = {
            "exercises": [
                {"name": "Ejercicio C", "sets": "3", "reps": "10"},
                {"name": "Ejercicio A", "sets": "3", "reps": "10"},
                {"name": "Ejercicio B", "sets": "3", "reps": "10"}
            ]
        }
        update_response = api_client.put(
            f"{base_url}/api/workouts/{workout_id}",
            json=update_payload,
            headers=auth_headers
        )
        print(f"Reorder workout response: {update_response.status_code}")
        
        assert update_response.status_code == 200
        updated = update_response.json()
        assert updated["exercises"][0]["name"] == "Ejercicio C"
        assert updated["exercises"][1]["name"] == "Ejercicio A"
        assert updated["exercises"][2]["name"] == "Ejercicio B"
        
        # Verify persistence
        get_response = api_client.get(
            f"{base_url}/api/workouts/{workout_id}",
            headers=auth_headers
        )
        assert get_response.status_code == 200
        fetched = get_response.json()
        assert fetched["exercises"][0]["name"] == "Ejercicio C"
        assert fetched["exercises"][1]["name"] == "Ejercicio A"
        assert fetched["exercises"][2]["name"] == "Ejercicio B"


class TestPhysicalTestsUpdateDelete:
    """Tests for edit/delete physical tests (Features 3 & 4)"""

    def test_update_test_value_unit_notes(self, base_url, api_client, auth_headers, lote1_athlete):
        """PUT /api/tests/{id} - update value, unit, and notes"""
        # Create a test first
        create_payload = {
            "athlete_id": lote1_athlete["id"],
            "test_type": "strength",
            "test_name": "squat_rm",
            "value": 100.0,
            "unit": "kg",
            "date": datetime.now(timezone.utc).strftime('%Y-%m-%d'),
            "notes": "Nota inicial"
        }
        create_response = api_client.post(
            f"{base_url}/api/tests",
            json=create_payload,
            headers=auth_headers
        )
        assert create_response.status_code == 200
        test = create_response.json()
        test_id = test["id"]
        
        # Update the test
        update_payload = {
            "value": 120.0,
            "unit": "lb",
            "notes": "Nota actualizada: PR conseguido"
        }
        update_response = api_client.put(
            f"{base_url}/api/tests/{test_id}",
            json=update_payload,
            headers=auth_headers
        )
        print(f"Update test response: {update_response.status_code} - {update_response.text}")
        
        assert update_response.status_code == 200
        updated = update_response.json()
        assert updated["value"] == 120.0
        assert updated["unit"] == "lb"
        assert updated["notes"] == "Nota actualizada: PR conseguido"
        assert "_id" not in updated
        
        # Verify persistence via GET /api/tests filter
        list_response = api_client.get(
            f"{base_url}/api/tests?athlete_id={lote1_athlete['id']}",
            headers=auth_headers
        )
        assert list_response.status_code == 200
        tests = list_response.json()
        test_found = next((t for t in tests if t["id"] == test_id), None)
        assert test_found is not None
        assert test_found["value"] == 120.0
        assert test_found["unit"] == "lb"
        assert test_found["notes"] == "Nota actualizada: PR conseguido"

    def test_delete_test(self, base_url, api_client, auth_headers, lote1_athlete):
        """DELETE /api/tests/{id} - delete a physical test"""
        # Create a test to delete
        create_payload = {
            "athlete_id": lote1_athlete["id"],
            "test_type": "plyometrics",
            "test_name": "cmj",
            "value": 40.0,
            "unit": "cm",
            "date": datetime.now(timezone.utc).strftime('%Y-%m-%d'),
            "notes": "Test para eliminar"
        }
        create_response = api_client.post(
            f"{base_url}/api/tests",
            json=create_payload,
            headers=auth_headers
        )
        assert create_response.status_code == 200
        test = create_response.json()
        test_id = test["id"]
        
        # Verify test exists
        list_response_before = api_client.get(
            f"{base_url}/api/tests?athlete_id={lote1_athlete['id']}",
            headers=auth_headers
        )
        tests_before = list_response_before.json()
        assert any(t["id"] == test_id for t in tests_before)
        
        # Delete the test
        delete_response = api_client.delete(
            f"{base_url}/api/tests/{test_id}",
            headers=auth_headers
        )
        print(f"Delete test response: {delete_response.status_code} - {delete_response.text}")
        
        assert delete_response.status_code == 200
        delete_data = delete_response.json()
        assert "message" in delete_data
        
        # Verify test is deleted (not in list anymore)
        list_response_after = api_client.get(
            f"{base_url}/api/tests?athlete_id={lote1_athlete['id']}",
            headers=auth_headers
        )
        tests_after = list_response_after.json()
        assert not any(t["id"] == test_id for t in tests_after)

    def test_delete_nonexistent_test(self, base_url, api_client, auth_headers):
        """DELETE /api/tests/{id} - returns 404 for nonexistent test"""
        fake_id = str(uuid.uuid4())
        response = api_client.delete(
            f"{base_url}/api/tests/{fake_id}",
            headers=auth_headers
        )
        print(f"Delete nonexistent test response: {response.status_code}")
        
        assert response.status_code == 404


class TestBilateralTests:
    """Tests for bilateral physical tests with value_left/value_right (Feature 5)"""

    def test_create_bilateral_test(self, base_url, api_client, auth_headers, lote1_athlete):
        """POST /api/tests - create test with value_left and value_right"""
        payload = {
            "athlete_id": lote1_athlete["id"],
            "test_type": "max_force",
            "test_name": "hamstring",
            "value": 0,  # Main value can be 0 for bilateral
            "unit": "N",
            "date": datetime.now(timezone.utc).strftime('%Y-%m-%d'),
            "notes": "Test bilateral isquiotibiales",
            "value_left": 320.5,
            "value_right": 340.0
        }
        response = api_client.post(
            f"{base_url}/api/tests",
            json=payload,
            headers=auth_headers
        )
        print(f"Create bilateral test response: {response.status_code} - {response.text}")
        
        assert response.status_code == 200
        data = response.json()
        assert data["value_left"] == 320.5
        assert data["value_right"] == 340.0
        assert data["test_type"] == "max_force"
        assert data["unit"] == "N"
        assert "_id" not in data
        
        return data

    def test_update_bilateral_test_values(self, base_url, api_client, auth_headers, lote1_athlete):
        """PUT /api/tests/{id} - update value_left and value_right"""
        # Create bilateral test first
        create_payload = {
            "athlete_id": lote1_athlete["id"],
            "test_type": "max_force",
            "test_name": "quadriceps",
            "value": 0,
            "unit": "N",
            "date": datetime.now(timezone.utc).strftime('%Y-%m-%d'),
            "value_left": 400.0,
            "value_right": 420.0
        }
        create_response = api_client.post(
            f"{base_url}/api/tests",
            json=create_payload,
            headers=auth_headers
        )
        assert create_response.status_code == 200
        test = create_response.json()
        test_id = test["id"]
        
        # Update bilateral values
        update_payload = {
            "value_left": 450.0,
            "value_right": 470.0,
            "notes": "Mejora significativa"
        }
        update_response = api_client.put(
            f"{base_url}/api/tests/{test_id}",
            json=update_payload,
            headers=auth_headers
        )
        print(f"Update bilateral test response: {update_response.status_code} - {update_response.text}")
        
        assert update_response.status_code == 200
        updated = update_response.json()
        assert updated["value_left"] == 450.0
        assert updated["value_right"] == 470.0
        assert updated["notes"] == "Mejora significativa"
        
        # Verify persistence
        list_response = api_client.get(
            f"{base_url}/api/tests?athlete_id={lote1_athlete['id']}",
            headers=auth_headers
        )
        tests = list_response.json()
        test_found = next((t for t in tests if t["id"] == test_id), None)
        assert test_found is not None
        assert test_found["value_left"] == 450.0
        assert test_found["value_right"] == 470.0


class TestUpdateTestNotFound:
    """Test update returns 404 for nonexistent test"""

    def test_update_nonexistent_test(self, base_url, api_client, auth_headers):
        """PUT /api/tests/{id} - returns 404 for nonexistent test"""
        fake_id = str(uuid.uuid4())
        update_payload = {"value": 999.0}
        response = api_client.put(
            f"{base_url}/api/tests/{fake_id}",
            json=update_payload,
            headers=auth_headers
        )
        print(f"Update nonexistent test response: {response.status_code}")
        
        assert response.status_code == 404
