#!/usr/bin/env python3
"""
Comprehensive Backend API Tests for Fitness Tracking App
Tests all endpoints defined in the review request against the live API
"""

import requests
import json
import uuid
import io
from datetime import datetime, timedelta

class FitnessAPITester:
    def __init__(self):
        self.base_url = "https://training-mode-test.preview.emergentagent.com"
        self.session = requests.Session()
        self.session.headers.update({"Content-Type": "application/json"})
        self.trainer_token = None
        self.athlete_token = None
        self.test_data = {}
        self.results = []
        
    def log_result(self, test_name, success, details="", response_data=None):
        """Log test results for reporting"""
        result = {
            "test": test_name,
            "success": success,
            "details": details,
            "response_data": response_data
        }
        self.results.append(result)
        status = "✅ PASS" if success else "❌ FAIL"
        print(f"{status}: {test_name}")
        if details:
            print(f"    {details}")
        if not success and response_data:
            print(f"    Response: {response_data}")
        print()
    
    def test_auth_flow(self):
        """Test complete authentication flow"""
        print("=== Testing Authentication Flow ===")
        
        # 1. Register trainer
        trainer_email = f"trainer_{uuid.uuid4().hex[:8]}@test.com"
        trainer_payload = {
            "name": "Test Trainer",
            "email": trainer_email,
            "password": "TrainerPass123",
            "role": "trainer"
        }
        
        try:
            response = self.session.post(f"{self.base_url}/api/auth/register", json=trainer_payload)
            if response.status_code == 200:
                data = response.json()
                self.trainer_token = data.get('token')
                self.test_data['trainer_id'] = data['user']['id']
                self.test_data['trainer_email'] = trainer_email
                self.log_result("POST /api/auth/register (trainer)", True, f"Created trainer: {trainer_email}")
            else:
                self.log_result("POST /api/auth/register (trainer)", False, 
                              f"Status: {response.status_code}", response.text)
                return False
        except Exception as e:
            self.log_result("POST /api/auth/register (trainer)", False, f"Exception: {e}")
            return False
        
        # 2. Login trainer
        login_payload = {
            "email": trainer_email,
            "password": "TrainerPass123"
        }
        
        try:
            response = self.session.post(f"{self.base_url}/api/auth/login", json=login_payload)
            if response.status_code == 200:
                data = response.json()
                token = data.get('token')
                if token and token == self.trainer_token:
                    self.log_result("POST /api/auth/login", True, "Login successful, token matches")
                else:
                    self.log_result("POST /api/auth/login", False, "Token mismatch", data)
            else:
                self.log_result("POST /api/auth/login", False, 
                              f"Status: {response.status_code}", response.text)
        except Exception as e:
            self.log_result("POST /api/auth/login", False, f"Exception: {e}")
        
        # 3. Get current user
        if self.trainer_token:
            try:
                headers = {"Authorization": f"Bearer {self.trainer_token}"}
                response = self.session.get(f"{self.base_url}/api/auth/me", headers=headers)
                if response.status_code == 200:
                    data = response.json()
                    if data.get('email') == trainer_email and data.get('role') == 'trainer':
                        self.log_result("GET /api/auth/me", True, "Current user data correct")
                    else:
                        self.log_result("GET /api/auth/me", False, "User data mismatch", data)
                else:
                    self.log_result("GET /api/auth/me", False, 
                                  f"Status: {response.status_code}", response.text)
            except Exception as e:
                self.log_result("GET /api/auth/me", False, f"Exception: {e}")
        
        return self.trainer_token is not None
    
    def test_athlete_management(self):
        """Test athlete management endpoints (requires trainer token)"""
        print("=== Testing Athlete Management ===")
        
        if not self.trainer_token:
            self.log_result("Athlete Management", False, "No trainer token available")
            return False
        
        headers = {"Authorization": f"Bearer {self.trainer_token}"}
        
        # 1. Create athlete
        athlete_email = f"athlete_{uuid.uuid4().hex[:8]}@test.com"
        athlete_payload = {
            "email": athlete_email,
            "password": "AthletePass123",
            "name": "Test Athlete",
            "sport": "Football",
            "position": "Quarterback"
        }
        
        try:
            response = self.session.post(f"{self.base_url}/api/athletes", json=athlete_payload, headers=headers)
            if response.status_code == 200:
                data = response.json()
                self.test_data['athlete_id'] = data['id']
                self.test_data['athlete_email'] = athlete_email
                self.log_result("POST /api/athletes", True, f"Created athlete: {athlete_email}")
            else:
                self.log_result("POST /api/athletes", False, 
                              f"Status: {response.status_code}", response.text)
                return False
        except Exception as e:
            self.log_result("POST /api/athletes", False, f"Exception: {e}")
            return False
        
        # 2. List athletes
        try:
            response = self.session.get(f"{self.base_url}/api/athletes", headers=headers)
            if response.status_code == 200:
                athletes = response.json()
                if isinstance(athletes, list) and len(athletes) > 0:
                    found_athlete = any(a.get('id') == self.test_data['athlete_id'] for a in athletes)
                    if found_athlete:
                        self.log_result("GET /api/athletes", True, f"Found {len(athletes)} athletes")
                    else:
                        self.log_result("GET /api/athletes", False, "Created athlete not in list")
                else:
                    self.log_result("GET /api/athletes", False, "No athletes returned", athletes)
            else:
                self.log_result("GET /api/athletes", False, 
                              f"Status: {response.status_code}", response.text)
        except Exception as e:
            self.log_result("GET /api/athletes", False, f"Exception: {e}")
        
        # 3. Get specific athlete
        if self.test_data.get('athlete_id'):
            try:
                athlete_id = self.test_data['athlete_id']
                response = self.session.get(f"{self.base_url}/api/athletes/{athlete_id}", headers=headers)
                if response.status_code == 200:
                    data = response.json()
                    if data.get('id') == athlete_id and data.get('email') == athlete_email:
                        self.log_result("GET /api/athletes/{id}", True, "Athlete details correct")
                    else:
                        self.log_result("GET /api/athletes/{id}", False, "Athlete data mismatch", data)
                else:
                    self.log_result("GET /api/athletes/{id}", False, 
                                  f"Status: {response.status_code}", response.text)
            except Exception as e:
                self.log_result("GET /api/athletes/{id}", False, f"Exception: {e}")
        
        return True
    
    def test_workouts(self):
        """Test workout endpoints"""
        print("=== Testing Workouts ===")
        
        if not self.trainer_token or not self.test_data.get('athlete_id'):
            self.log_result("Workouts", False, "Missing trainer token or athlete_id")
            return False
        
        headers = {"Authorization": f"Bearer {self.trainer_token}"}
        athlete_id = self.test_data['athlete_id']
        
        # 1. Create workout with video_url
        workout_date = (datetime.now() + timedelta(days=1)).strftime('%Y-%m-%d')
        workout_payload = {
            "athlete_id": athlete_id,
            "date": workout_date,
            "title": "Test Workout Session",
            "exercises": [
                {
                    "name": "Squats",
                    "sets": "4",
                    "reps": "10",
                    "weight": "100kg",
                    "rest": "2min",
                    "video_url": "https://youtube.com/watch?v=test123"
                },
                {
                    "name": "Bench Press",
                    "sets": "3",
                    "reps": "8",
                    "weight": "80kg",
                    "rest": "3min",
                    "video_url": "https://drive.google.com/file/example"
                }
            ],
            "notes": "Focus on form and breathing"
        }
        
        try:
            response = self.session.post(f"{self.base_url}/api/workouts", json=workout_payload, headers=headers)
            if response.status_code == 200:
                data = response.json()
                self.test_data['workout_id'] = data['id']
                # Check video_url persistence
                video_urls_preserved = all(
                    ex.get('video_url') for ex in data.get('exercises', []) 
                    if ex['name'] in ['Squats', 'Bench Press']
                )
                if video_urls_preserved:
                    self.log_result("POST /api/workouts", True, "Workout created with video URLs preserved")
                else:
                    self.log_result("POST /api/workouts", False, "Video URLs not preserved", data)
            else:
                self.log_result("POST /api/workouts", False, 
                              f"Status: {response.status_code}", response.text)
                return False
        except Exception as e:
            self.log_result("POST /api/workouts", False, f"Exception: {e}")
            return False
        
        # 2. List workouts (with athlete_id filter)
        try:
            response = self.session.get(f"{self.base_url}/api/workouts?athlete_id={athlete_id}", headers=headers)
            if response.status_code == 200:
                workouts = response.json()
                if isinstance(workouts, list) and len(workouts) > 0:
                    found_workout = any(w.get('id') == self.test_data.get('workout_id') for w in workouts)
                    if found_workout:
                        self.log_result("GET /api/workouts", True, f"Found {len(workouts)} workouts")
                    else:
                        self.log_result("GET /api/workouts", False, "Created workout not in list")
                else:
                    self.log_result("GET /api/workouts", False, "No workouts returned")
            else:
                self.log_result("GET /api/workouts", False, 
                              f"Status: {response.status_code}", response.text)
        except Exception as e:
            self.log_result("GET /api/workouts", False, f"Exception: {e}")
        
        # 3. Get specific workout
        if self.test_data.get('workout_id'):
            try:
                workout_id = self.test_data['workout_id']
                response = self.session.get(f"{self.base_url}/api/workouts/{workout_id}", headers=headers)
                if response.status_code == 200:
                    data = response.json()
                    if data.get('id') == workout_id:
                        self.log_result("GET /api/workouts/{id}", True, "Workout details retrieved")
                    else:
                        self.log_result("GET /api/workouts/{id}", False, "Workout data mismatch")
                else:
                    self.log_result("GET /api/workouts/{id}", False, 
                                  f"Status: {response.status_code}", response.text)
            except Exception as e:
                self.log_result("GET /api/workouts/{id}", False, f"Exception: {e}")
        
        # 4. Update workout (mark completed)
        if self.test_data.get('workout_id'):
            try:
                workout_id = self.test_data['workout_id']
                update_payload = {"completed": True}
                response = self.session.put(f"{self.base_url}/api/workouts/{workout_id}", 
                                          json=update_payload, headers=headers)
                if response.status_code == 200:
                    data = response.json()
                    if data.get('completed') is True:
                        self.log_result("PUT /api/workouts/{id}", True, "Workout marked as completed")
                    else:
                        self.log_result("PUT /api/workouts/{id}", False, "Completion status not updated")
                else:
                    self.log_result("PUT /api/workouts/{id}", False, 
                                  f"Status: {response.status_code}", response.text)
            except Exception as e:
                self.log_result("PUT /api/workouts/{id}", False, f"Exception: {e}")
        
        # 5. Test CSV template download
        try:
            response = self.session.get(f"{self.base_url}/api/workouts/csv-template", headers=headers)
            if response.status_code == 200:
                csv_content = response.text
                if 'video' in csv_content.lower() and 'dia' in csv_content:
                    self.log_result("GET /api/workouts/csv-template", True, "CSV template includes video column")
                else:
                    self.log_result("GET /api/workouts/csv-template", False, "CSV template missing video column")
            else:
                self.log_result("GET /api/workouts/csv-template", False, 
                              f"Status: {response.status_code}", response.text)
        except Exception as e:
            self.log_result("GET /api/workouts/csv-template", False, f"Exception: {e}")
        
        # 6. Test CSV upload
        try:
            csv_data = """dia,ejercicio,repeticiones,series,video
2026-02-25,Push-ups,15,3,https://youtube.com/pushups
2026-02-25,Pull-ups,10,3,
2026-02-26,Deadlifts,5,4,https://drive.google.com/deadlifts"""
            
            # Use direct string method which works
            files = {'file': ('test_workout.csv', csv_data, 'text/csv')}
            # Remove Content-Type header completely for multipart upload
            headers_upload = {k: v for k, v in headers.items() if k.lower() != 'content-type'}
            
            response = self.session.post(f"{self.base_url}/api/workouts/csv?athlete_id={athlete_id}", 
                                       files=files, headers=headers_upload)
            if response.status_code == 200:
                data = response.json()
                if data.get('count', 0) > 0 and 'workouts' in data:
                    self.log_result("POST /api/workouts/csv", True, f"Uploaded {data['count']} workouts from CSV")
                else:
                    self.log_result("POST /api/workouts/csv", False, "No workouts created from CSV")
            else:
                self.log_result("POST /api/workouts/csv", False, 
                              f"Status: {response.status_code}", response.text)
        except Exception as e:
            self.log_result("POST /api/workouts/csv", False, f"Exception: {e}")
        
        return True
    
    def test_physical_tests(self):
        """Test physical tests endpoints"""
        print("=== Testing Physical Tests ===")
        
        if not self.trainer_token or not self.test_data.get('athlete_id'):
            self.log_result("Physical Tests", False, "Missing trainer token or athlete_id")
            return False
        
        headers = {"Authorization": f"Bearer {self.trainer_token}"}
        athlete_id = self.test_data['athlete_id']
        
        # 1. Create strength test
        test_date = datetime.now().strftime('%Y-%m-%d')
        test_payload = {
            "athlete_id": athlete_id,
            "test_type": "strength",
            "test_name": "squat_rm",
            "value": 150.5,
            "unit": "kg",
            "date": test_date,
            "notes": "Personal best achieved"
        }
        
        try:
            response = self.session.post(f"{self.base_url}/api/tests", json=test_payload, headers=headers)
            if response.status_code == 200:
                data = response.json()
                self.test_data['test_id'] = data['id']
                self.log_result("POST /api/tests (strength)", True, "Strength test created")
            else:
                self.log_result("POST /api/tests (strength)", False, 
                              f"Status: {response.status_code}", response.text)
        except Exception as e:
            self.log_result("POST /api/tests (strength)", False, f"Exception: {e}")
        
        # 2. Create plyometrics test
        plyo_payload = {
            "athlete_id": athlete_id,
            "test_type": "plyometrics",
            "test_name": "cmj",
            "value": 45.2,
            "unit": "cm",
            "date": test_date,
            "notes": "Good jump height"
        }
        
        try:
            response = self.session.post(f"{self.base_url}/api/tests", json=plyo_payload, headers=headers)
            if response.status_code == 200:
                data = response.json()
                self.test_data['plyo_test_id'] = data['id']
                self.log_result("POST /api/tests (plyometrics)", True, "Plyometrics test created")
            else:
                self.log_result("POST /api/tests (plyometrics)", False, 
                              f"Status: {response.status_code}", response.text)
        except Exception as e:
            self.log_result("POST /api/tests (plyometrics)", False, f"Exception: {e}")
        
        # 3. List tests with filters
        try:
            response = self.session.get(f"{self.base_url}/api/tests?athlete_id={athlete_id}", headers=headers)
            if response.status_code == 200:
                tests = response.json()
                if isinstance(tests, list) and len(tests) >= 2:
                    self.log_result("GET /api/tests", True, f"Found {len(tests)} tests")
                else:
                    self.log_result("GET /api/tests", False, "Insufficient tests returned")
            else:
                self.log_result("GET /api/tests", False, 
                              f"Status: {response.status_code}", response.text)
        except Exception as e:
            self.log_result("GET /api/tests", False, f"Exception: {e}")
        
        # 4. Get test history
        try:
            response = self.session.get(
                f"{self.base_url}/api/tests/history?athlete_id={athlete_id}&test_name=squat_rm", 
                headers=headers
            )
            if response.status_code == 200:
                history = response.json()
                if isinstance(history, list) and len(history) > 0:
                    # Check if sorted by date ascending
                    dates = [test['date'] for test in history]
                    is_sorted = dates == sorted(dates)
                    if is_sorted:
                        self.log_result("GET /api/tests/history", True, "Test history sorted correctly")
                    else:
                        self.log_result("GET /api/tests/history", False, "Test history not sorted by date")
                else:
                    self.log_result("GET /api/tests/history", False, "No test history returned")
            else:
                self.log_result("GET /api/tests/history", False, 
                              f"Status: {response.status_code}", response.text)
        except Exception as e:
            self.log_result("GET /api/tests/history", False, f"Exception: {e}")
        
        # 5. Update test
        if self.test_data.get('test_id'):
            try:
                test_id = self.test_data['test_id']
                update_payload = {"value": 155.0, "notes": "Updated personal best"}
                response = self.session.put(f"{self.base_url}/api/tests/{test_id}", 
                                          json=update_payload, headers=headers)
                if response.status_code == 200:
                    data = response.json()
                    if data.get('value') == 155.0:
                        self.log_result("PUT /api/tests/{id}", True, "Test updated successfully")
                    else:
                        self.log_result("PUT /api/tests/{id}", False, "Test value not updated")
                else:
                    self.log_result("PUT /api/tests/{id}", False, 
                                  f"Status: {response.status_code}", response.text)
            except Exception as e:
                self.log_result("PUT /api/tests/{id}", False, f"Exception: {e}")
        
        return True
    
    def test_analytics(self):
        """Test analytics endpoints"""
        print("=== Testing Analytics ===")
        
        if not self.trainer_token or not self.test_data.get('athlete_id'):
            self.log_result("Analytics", False, "Missing trainer token or athlete_id")
            return False
        
        headers = {"Authorization": f"Bearer {self.trainer_token}"}
        athlete_id = self.test_data['athlete_id']
        
        # 1. Get analytics summary
        try:
            response = self.session.get(f"{self.base_url}/api/analytics/summary?athlete_id={athlete_id}", 
                                      headers=headers)
            if response.status_code == 200:
                data = response.json()
                required_fields = ['total_workouts', 'completed_workouts', 'total_tests', 'completion_rate']
                if all(field in data for field in required_fields):
                    self.log_result("GET /api/analytics/summary", True, 
                                  f"Summary: {data['total_workouts']} workouts, {data['total_tests']} tests")
                else:
                    self.log_result("GET /api/analytics/summary", False, "Missing required fields", data)
            else:
                self.log_result("GET /api/analytics/summary", False, 
                              f"Status: {response.status_code}", response.text)
        except Exception as e:
            self.log_result("GET /api/analytics/summary", False, f"Exception: {e}")
        
        # 2. Get progress data
        try:
            response = self.session.get(f"{self.base_url}/api/analytics/progress?athlete_id={athlete_id}", 
                                      headers=headers)
            if response.status_code == 200:
                data = response.json()
                if isinstance(data, dict):
                    self.log_result("GET /api/analytics/progress", True, 
                                  f"Progress data for {len(data)} test types")
                else:
                    self.log_result("GET /api/analytics/progress", False, "Invalid progress data format")
            else:
                self.log_result("GET /api/analytics/progress", False, 
                              f"Status: {response.status_code}", response.text)
        except Exception as e:
            self.log_result("GET /api/analytics/progress", False, f"Exception: {e}")
        
        return True
    
    def test_profile_settings(self):
        """Test profile and settings endpoints"""
        print("=== Testing Profile & Settings ===")
        
        if not self.trainer_token:
            self.log_result("Profile & Settings", False, "No trainer token available")
            return False
        
        headers = {"Authorization": f"Bearer {self.trainer_token}"}
        
        # 1. Update profile
        try:
            profile_payload = {
                "name": "Updated Trainer Name",
                "sport": "Basketball",
                "position": "Coach"
            }
            response = self.session.put(f"{self.base_url}/api/profile", json=profile_payload, headers=headers)
            if response.status_code == 200:
                data = response.json()
                if data.get('name') == "Updated Trainer Name":
                    self.log_result("PUT /api/profile", True, "Profile updated successfully")
                else:
                    self.log_result("PUT /api/profile", False, "Profile not updated", data)
            else:
                self.log_result("PUT /api/profile", False, 
                              f"Status: {response.status_code}", response.text)
        except Exception as e:
            self.log_result("PUT /api/profile", False, f"Exception: {e}")
        
        # 2. Get settings
        try:
            response = self.session.get(f"{self.base_url}/api/settings", headers=headers)
            if response.status_code == 200:
                data = response.json()
                expected_fields = ['notifications_enabled', 'weight_unit', 'language']
                if all(field in data for field in expected_fields):
                    self.log_result("GET /api/settings", True, "Settings retrieved with default values")
                else:
                    self.log_result("GET /api/settings", False, "Missing settings fields", data)
            else:
                self.log_result("GET /api/settings", False, 
                              f"Status: {response.status_code}", response.text)
        except Exception as e:
            self.log_result("GET /api/settings", False, f"Exception: {e}")
        
        # 3. Update settings
        try:
            settings_payload = {
                "notifications_enabled": False,
                "weight_unit": "lb",
                "language": "en"
            }
            response = self.session.put(f"{self.base_url}/api/settings", json=settings_payload, headers=headers)
            if response.status_code == 200:
                data = response.json()
                if (data.get('notifications_enabled') is False and 
                    data.get('weight_unit') == 'lb' and 
                    data.get('language') == 'en'):
                    self.log_result("PUT /api/settings", True, "Settings updated successfully")
                else:
                    self.log_result("PUT /api/settings", False, "Settings not updated correctly", data)
            else:
                self.log_result("PUT /api/settings", False, 
                              f"Status: {response.status_code}", response.text)
        except Exception as e:
            self.log_result("PUT /api/settings", False, f"Exception: {e}")
        
        # 4. Change password
        try:
            password_payload = {
                "current_password": "TrainerPass123",
                "new_password": "NewTrainerPass456"
            }
            response = self.session.put(f"{self.base_url}/api/profile/password", 
                                      json=password_payload, headers=headers)
            if response.status_code == 200:
                data = response.json()
                if 'message' in data or 'actualizada' in str(data):
                    self.log_result("PUT /api/profile/password", True, "Password changed successfully")
                else:
                    self.log_result("PUT /api/profile/password", False, "Unexpected response", data)
            else:
                self.log_result("PUT /api/profile/password", False, 
                              f"Status: {response.status_code}", response.text)
        except Exception as e:
            self.log_result("PUT /api/profile/password", False, f"Exception: {e}")
        
        return True
    
    def test_cleanup(self):
        """Clean up test data"""
        print("=== Cleaning Up Test Data ===")
        
        if not self.trainer_token:
            return
        
        headers = {"Authorization": f"Bearer {self.trainer_token}"}
        
        # Delete workout
        if self.test_data.get('workout_id'):
            try:
                workout_id = self.test_data['workout_id']
                response = self.session.delete(f"{self.base_url}/api/workouts/{workout_id}", headers=headers)
                if response.status_code == 200:
                    self.log_result("DELETE /api/workouts/{id}", True, "Workout deleted")
                else:
                    self.log_result("DELETE /api/workouts/{id}", False, 
                                  f"Status: {response.status_code}", response.text)
            except Exception as e:
                self.log_result("DELETE /api/workouts/{id}", False, f"Exception: {e}")
        
        # Delete tests
        for test_key in ['test_id', 'plyo_test_id']:
            if self.test_data.get(test_key):
                try:
                    test_id = self.test_data[test_key]
                    response = self.session.delete(f"{self.base_url}/api/tests/{test_id}", headers=headers)
                    if response.status_code == 200:
                        self.log_result("DELETE /api/tests/{id}", True, "Test deleted")
                    else:
                        self.log_result("DELETE /api/tests/{id}", False, 
                                      f"Status: {response.status_code}", response.text)
                except Exception as e:
                    self.log_result("DELETE /api/tests/{id}", False, f"Exception: {e}")
        
        # Delete athlete
        if self.test_data.get('athlete_id'):
            try:
                athlete_id = self.test_data['athlete_id']
                response = self.session.delete(f"{self.base_url}/api/athletes/{athlete_id}", headers=headers)
                if response.status_code == 200:
                    self.log_result("DELETE /api/athletes/{id}", True, "Athlete deleted")
                else:
                    self.log_result("DELETE /api/athletes/{id}", False, 
                                  f"Status: {response.status_code}", response.text)
            except Exception as e:
                self.log_result("DELETE /api/athletes/{id}", False, f"Exception: {e}")
    
    def run_all_tests(self):
        """Run all test suites"""
        print("🚀 Starting Comprehensive Fitness API Tests")
        print(f"Testing API at: {self.base_url}")
        print("=" * 60)
        
        # Run test suites in order
        auth_success = self.test_auth_flow()
        if auth_success:
            self.test_athlete_management()
            self.test_workouts()
            self.test_physical_tests()
            self.test_analytics()
            self.test_profile_settings()
            self.test_cleanup()
        else:
            print("❌ Authentication failed - skipping other tests")
        
        # Generate summary
        print("\n" + "=" * 60)
        print("📊 TEST SUMMARY")
        print("=" * 60)
        
        passed = sum(1 for r in self.results if r['success'])
        failed = sum(1 for r in self.results if not r['success'])
        total = len(self.results)
        
        print(f"Total Tests: {total}")
        print(f"Passed: {passed} ✅")
        print(f"Failed: {failed} ❌")
        print(f"Success Rate: {(passed/total*100):.1f}%" if total > 0 else "N/A")
        
        if failed > 0:
            print("\n🔍 FAILED TESTS:")
            for result in self.results:
                if not result['success']:
                    print(f"   ❌ {result['test']}: {result['details']}")
        
        print("\n✨ Testing Complete!")
        return passed, failed, total

def main():
    """Main test execution function"""
    tester = FitnessAPITester()
    passed, failed, total = tester.run_all_tests()
    
    # Exit with error code if tests failed
    if failed > 0:
        exit(1)
    else:
        exit(0)

if __name__ == "__main__":
    main()