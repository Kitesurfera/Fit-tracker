import AsyncStorage from '@react-native-async-storage/async-storage';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

async function getHeaders() {
  const token = await AsyncStorage.getItem('auth_token');
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers['Authorization'] = `Bearer ${token}`;
  return headers;
}

async function request(path: string, options: RequestInit = {}) {
  const headers = await getHeaders();
  const res = await fetch(`${BACKEND_URL}${path}`, { ...options, headers: { ...headers, ...options.headers } });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: 'Request failed' }));
    throw new Error(err.detail || 'Request failed');
  }
  return res.json();
}

export const api = {
  // Athletes
  getAthletes: () => request('/api/athletes'),
  createAthlete: (data: any) => request('/api/athletes', { method: 'POST', body: JSON.stringify(data) }),
  getAthlete: (id: string) => request(`/api/athletes/${id}`),
  deleteAthlete: (id: string) => request(`/api/athletes/${id}`, { method: 'DELETE' }),

  // Workouts
  getWorkouts: async (params?: { athlete_id?: string; date?: string }) => {
    const query = new URLSearchParams();
    if (params?.athlete_id) query.set('athlete_id', params.athlete_id);
    if (params?.date) query.set('date', params.date);
    
    try {
      const workouts = await request(`/api/workouts?${query.toString()}`);
      await AsyncStorage.setItem('offline_workouts', JSON.stringify(workouts));
      return workouts;
    } catch (error) {
      const offlineData = await AsyncStorage.getItem('offline_workouts');
      if (offlineData) return JSON.parse(offlineData);
      throw error;
    }
  },
  getWorkout: (id: string) => request(`/api/workouts/${id}`),
  createWorkout: (data: any) => request('/api/workouts', { method: 'POST', body: JSON.stringify(data) }),
  updateWorkout: (id: string, data: any) => request(`/api/workouts/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteWorkout: (id: string) => request(`/api/workouts/${id}`, { method: 'DELETE' }),

  completeWorkout: async (id: string, data: any) => {
    try {
      return await request(`/api/workouts/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ ...data, completed: true })
      });
    } catch (error) {
      const pending = await AsyncStorage.getItem('pending_sync') || '[]';
      const list = JSON.parse(pending);
      list.push({ id, data, type: 'COMPLETE_WORKOUT', timestamp: new Date().toISOString() });
      await AsyncStorage.setItem('pending_sync', JSON.stringify(list));
      return { status: 'saved_offline', message: 'Guardado localmente' };
    }
  },
  
  uploadCSV: async (athleteId: string, fileUri: string, fileName: string) => {
    const token = await AsyncStorage.getItem('auth_token');
    const formData = new FormData();
    const response = await fetch(fileUri);
    const blob = await response.blob();
    formData.append('file', blob, fileName);
    const res = await fetch(`${BACKEND_URL}/api/workouts/csv?athlete_id=${athleteId}`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
      body: formData,
    });
    return res.json();
  },

  getTests: (params?: { athlete_id?: string; test_type?: string; test_name?: string }) => {
    const query = new URLSearchParams();
    if (params?.athlete_id) query.set('athlete_id', params.athlete_id);
    if (params?.test_type) query.set('test_type', params.test_type);
    if (params?.test_name) query.set('test_name', params.test_name);
    return request(`/api/tests?${query.toString()}`);
  },
  
  getSummary: (athleteId?: string) => request(`/api/analytics/summary${athleteId ? `?athlete_id=${athleteId}` : ''}`),
  getPeriodizationTree: (athleteId: string) => request(`/api/periodization/tree/${athleteId}`),
  
  updateProfile: (data: any) => request('/api/profile', { method: 'PUT', body: JSON.stringify(data) }),
  getSettings: () => request('/api/settings'),
  updateSettings: (data: any) => request('/api/settings', { method: 'PUT', body: JSON.stringify(data) }),
  changePassword: (data: any) => request('/api/profile/password', { method: 'PUT', body: JSON.stringify(data) }),

  // --- NUEVA FUNCIÓN DE SINCRONIZACIÓN ---
  syncStrava: () => request('/api/auth/strava/sync', { method: 'POST' }),
  
  submitWellness: (data: any) => request('/api/wellness', { method: 'POST', body: JSON.stringify(data) }),
};
