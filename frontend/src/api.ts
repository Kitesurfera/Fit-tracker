import AsyncStorage from '@react-native-async-storage/async-storage';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

const getAuthHeaders = async () => {
  const token = await AsyncStorage.getItem('auth_token');
  return {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  };
};

export const api = {
  login: async (email, password) => {
    const res = await fetch(`${BACKEND_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) throw new Error('Credenciales incorrectas');
    return res.json();
  },

  postWellness: async (data: any) => {
    const headers = await getAuthHeaders();
    const res = await fetch(`${BACKEND_URL}/api/wellness`, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(data),
    });
    if (!res.ok) {
      const errorData = await res.json();
      throw new Error(errorData.detail || 'Error al guardar el estado');
    }
    return res.json();
  },

  getWellnessHistory: async (athleteId: string) => {
    const headers = await getAuthHeaders();
    const res = await fetch(`${BACKEND_URL}/api/wellness/history/${athleteId}`, {
      headers: headers,
    });
    if (!res.ok) throw new Error('No se pudo obtener el historial');
    return res.json();
  },

  getSummary: async (athleteId?: string) => {
    const headers = await getAuthHeaders();
    const url = athleteId 
      ? `${BACKEND_URL}/api/analytics/summary?athlete_id=${athleteId}`
      : `${BACKEND_URL}/api/analytics/summary`;
    const res = await fetch(url, { headers });
    return res.json();
  },

  getAthletes: async () => {
    const headers = await getAuthHeaders();
    const res = await fetch(`${BACKEND_URL}/api/athletes`, { headers });
    return res.json();
  },

  getAthlete: async (id: string) => {
    const headers = await getAuthHeaders();
    const res = await fetch(`${BACKEND_URL}/api/athletes/${id}`, { headers });
    return res.json();
  },

  getWorkouts: async (params?: { athlete_id?: string; date?: string }) => {
    const headers = await getAuthHeaders();
    let url = `${BACKEND_URL}/api/workouts`;
    if (params) {
      const query = new URLSearchParams(params as any).toString();
      url += `?${query}`;
    }
    const res = await fetch(url, { headers });
    return res.json();
  },

  updateWorkout: async (id: string, data: any) => {
    const headers = await getAuthHeaders();
    const res = await fetch(`${BACKEND_URL}/api/workouts/${id}`, {
      method: 'PUT',
      headers: headers,
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error('No se pudo actualizar el entrenamiento');
    return res.json();
  },

  getPeriodizationTree: async (athleteId: string) => {
    const headers = await getAuthHeaders();
    const res = await fetch(`${BACKEND_URL}/api/periodization/tree/${athleteId}`, { headers });
    return res.json();
  },

  updateProfile: async (data: any) => {
    const headers = await getAuthHeaders();
    const res = await fetch(`${BACKEND_URL}/api/profile`, {
      method: 'PUT',
      headers: headers,
      body: JSON.stringify(data),
    });
    return res.json();
  },

  // --- FUNCIONES DE TESTS RECUPERADAS ---
  getTests: async (params?: { athlete_id?: string; test_type?: string }) => {
    const headers = await getAuthHeaders();
    let url = `${BACKEND_URL}/api/tests`;
    if (params) {
      const query = new URLSearchParams(params as any).toString();
      url += `?${query}`;
    }
    const res = await fetch(url, { headers });
    if (!res.ok) throw new Error('Error cargando tests');
    return res.json();
  },

  deleteTest: async (id: string) => {
    const headers = await getAuthHeaders();
    const res = await fetch(`${BACKEND_URL}/api/tests/${id}`, {
      method: 'DELETE',
      headers: headers,
    });
    if (!res.ok) throw new Error('Error al eliminar el test');
    return res.json();
  },

  updateTest: async (id: string, data: any) => {
    const headers = await getAuthHeaders();
    const res = await fetch(`${BACKEND_URL}/api/tests/${id}`, {
      method: 'PUT',
      headers: headers,
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error('Error al actualizar el test');
    return res.json();
  }
};
