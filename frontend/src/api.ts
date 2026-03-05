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
      // Si hay red, guardamos copia para el modo offline (Safari PWA)
      await AsyncStorage.setItem('offline_workouts', JSON.stringify(workouts));
      return workouts;
    } catch (error) {
      // Si falla la red, intentamos cargar la "mochila"
      const offlineData = await AsyncStorage.getItem('offline_workouts');
      if (offlineData) {
        console.log("Cargando entrenamientos desde memoria local (Offline)");
        return JSON.parse(offlineData);
      }
      throw error;
    }
  },
  getWorkout: (id: string) => request(`/api/workouts/${id}`),
  createWorkout: (data: any) => request('/api/workouts', { method: 'POST', body: JSON.stringify(data) }),
  updateWorkout: (id: string, data: any) => request(`/api/workouts/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteWorkout: (id: string) => request(`/api/workouts/${id}`, { method: 'DELETE' }),

  // FUNCIÓN PARA COMPLETAR ENTRENOS (CON SOPORTE OFFLINE)
  completeWorkout: async (id: string, data: any) => {
    try {
      return await request(`/api/workouts/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ ...data, completed: True })
      });
    } catch (error) {
      // Si falla la conexión en la playa, guardamos en pendientes
      const pending = await AsyncStorage.getItem('pending_sync') || '[]';
      const list = JSON.parse(pending);
      list.push({ id, data, type: 'COMPLETE_WORKOUT', timestamp: new Date().toISOString() });
      await AsyncStorage.setItem('pending_sync', JSON.stringify(list));
      return { status: 'saved_offline', message: 'Guardado localmente. Se sincronizará al tener red.' };
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

    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Error al subir el archivo' }));
      throw new Error(err.detail || 'Error al subir el archivo');
    }
    return res.json();
  },

  // Tests
  getTests: (params?: { athlete_id?: string; test_type?: string; test_name?: string }) => {
    const query = new URLSearchParams();
    if (params?.athlete_id) query.set('athlete_id', params.athlete_id);
    if (params?.test_type) query.set('test_type', params.test_type);
    if (params?.test_name) query.set('test_name', params.test_name);
    return request(`/api/tests?${query.toString()}`);
  },
  createTest: (data: any) => request('/api/tests', { method: 'POST', body: JSON.stringify(data) }),
  updateTest: (id: string, data: any) => request(`/api/tests/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteTest: (id: string) => request(`/api/tests/${id}`, { method: 'DELETE' }),
  getTestHistory: (athleteId: string, testName: string) => request(`/api/tests/history?athlete_id=${athleteId}&test_name=${testName}`),

  // Analytics
  getSummary: (athleteId?: string) => {
    const query = athleteId ? `?athlete_id=${athleteId}` : '';
    return request(`/api/analytics/summary${query}`);
  },
  getProgress: (athleteId: string) => request(`/api/analytics/progress?athlete_id=${athleteId}`),

  // Profile & Settings
  updateProfile: (data: any) => request('/api/profile', { method: 'PUT', body: JSON.stringify(data) }),
  getSettings: () => request('/api/settings'),
  updateSettings: (data: any) => request('/api/settings', { method: 'PUT', body: JSON.stringify(data) }),
  changePassword: (data: { current_password: string; new_password: string }) =>
    request('/api/profile/password', { method: 'PUT', body: JSON.stringify(data) }),

  // File Upload
  uploadFile: async (fileUri: string, fileName: string, fileType: string) => {
    const token = await AsyncStorage.getItem('auth_token');
    const formData = new FormData();
    const fileResponse = await fetch(fileUri);
    const blob = await fileResponse.blob();
    formData.append('file', blob, fileName);
    const res = await fetch(`${BACKEND_URL}/api/upload`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${token}` },
      body: formData,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ detail: 'Upload failed' }));
      throw new Error(err.detail || 'Upload failed');
    }
    return res.json();
  },
  getFileUrl: async (storagePath: string) => {
    const token = await AsyncStorage.getItem('auth_token');
    return `${BACKEND_URL}/api/files/${storagePath}?auth=${token}`;
  },

  // CSV Template URL
  getCSVTemplateURL: () => `${BACKEND_URL}/api/workouts/csv-template`,

  // --- PERIODIZACIÓN (MACRO/MICROCICLOS) ---
  createMacrociclo: (data: any) => request('/api/macrociclos', { method: 'POST', body: JSON.stringify(data) }),
  updateMacrociclo: (id: string, data: any) => request(`/api/macrociclos/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteMacrociclo: (id: string) => request(`/api/macrociclos/${id}`, { method: 'DELETE' }),
  
  createMicrociclo: (data: any) => request('/api/microciclos', { method: 'POST', body: JSON.stringify(data) }),
  updateMicrociclo: (id: string, data: any) => request(`/api/microciclos/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteMicrociclo: (id: string) => request(`/api/microciclos/${id}`, { method: 'DELETE' }),
  
  getPeriodizationTree: (athleteId: string) => request(`/api/periodization/tree/${athleteId}`),
  submitWellness: (data: any) => request('/api/wellness', { method: 'POST', body: JSON.stringify(data) }),
  checkTodayWellness: () => request('/api/wellness/today'),
};
