# Performance Pro - Fitness Tracking App

## Problem Statement
Full-stack fitness tracking application for trainers ("entrenadores") and athletes ("deportistas"). Trainers manage athlete profiles, create/assign workouts, and view progress. Athletes view assigned workouts, track progress in a guided "Training Mode", and log physical test results.

## Tech Stack
- **Backend**: FastAPI + MongoDB (pymongo/motor) + JWT Auth
- **Frontend**: React Native with Expo (SDK 54), Expo Router, TypeScript
- **Database**: MongoDB

## Architecture
```
/app
├── backend/
│   ├── server.py         # All API routes and models
│   └── tests/            # Pytest test files
└── frontend/
    ├── src/api.ts        # API client
    ├── src/context/      # Auth context
    └── app/              # Expo Router pages
        ├── (auth)/       # Login/Register
        ├── (tabs)/       # Home, Calendar, Tests, Analytics, Settings
        ├── add-workout.tsx
        ├── edit-workout.tsx
        ├── add-test.tsx
        ├── athlete-detail.tsx
        └── training-mode.tsx
```

## Completed Features
- JWT authentication (trainer + athlete roles)
- Trainer: create/manage athletes
- Workout CRUD (create, edit, delete, duplicate)
- CSV import/export for workouts
- Interactive calendar with athlete names
- Training Mode with set-by-set completion tracking
- Bilateral physical tests (max force with left/right values)
- Series-based completion percentage calculation
- Workout duplication to new dates

### Lote 1 (Completed 2026-02-27)
1. Exercise observations (exercise_notes) in add/edit workout
2. Exercise reordering (up/down arrows) in edit-workout
3. Enhanced athlete home screen (Hecho/Incompleto/Pendiente + % bar)
4. Edit/delete physical tests (modal with bilateral support)

## Pending / Upcoming Tasks

### Lote 2 (P1)
- Image upload for exercises (requires object storage integration)
- Training Mode rest timer/stopwatch
- Post-workout observations screen (summary + notes after finishing)

### Future (P2)
- Advanced Analytics/Performance tab with graphs (progress, PRs, bilateral asymmetry)
- Backend refactoring (split server.py into routes/models/services)

## Key API Endpoints
- `POST /api/auth/register`, `POST /api/auth/login`, `GET /api/auth/me`
- `GET/POST /api/athletes`, `GET/DELETE /api/athletes/{id}`
- `GET/POST /api/workouts`, `GET/PUT/DELETE /api/workouts/{id}`
- `POST /api/workouts/csv`, `GET /api/workouts/csv-template`
- `GET/POST /api/tests`, `PUT/DELETE /api/tests/{id}`
- `GET /api/tests/history`
- `GET /api/analytics/summary`, `GET /api/analytics/progress`

## Test Accounts
- Trainer: trainer_lote1@test.com / test1234
- Athlete: athlete_lote1@test.com / test1234
