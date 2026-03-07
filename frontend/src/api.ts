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
  createAthlete: async (data: any) => {
    const headers = await getAuthHeaders();
    const res = await fetch(`${BACKEND_URL}/api/athletes`, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error('Error al crear deportista');
    return res.json();
  },

  updateAthlete: async (id: string, data: any) => {
    const headers = await getAuthHeaders();
    const res = await fetch(`${BACKEND_URL}/api/athletes/${id}`, {
      method: 'PUT',
      headers: headers,
      body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error('Error al actualizar deportista');
    return res.json();
  },

  deleteAthlete: async (id: string) => {
    const headers = await getAuthHeaders();
    const res = await fetch(`${BACKEND_URL}/api/athletes/${id}`, {
      method: 'DELETE',
      headers: headers,
    });
    if (!res.ok) throw new Error('Error al eliminar deportista');
    return res.json();
  },

  // --- ENTRENAMIENTOS ---
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

  createWorkout: async (data: any) => {
    const headers = await getAuthHeaders();
    const res = await fetch(`${BACKEND_URL}/api/workouts`, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(data),
    });
    return res.json();
  },

  createWorkoutsBulk: async (data: { workouts: any[] }) => {
    const headers = await getAuthHeaders();
    const res = await fetch(`${BACKEND_URL}/api/workouts/bulk`, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(data),
    });
    return res.json();
  },

  deleteWorkout: async (id: string) => {
    const headers = await getAuthHeaders();
    const res = await fetch(`${BACKEND_URL}/api/workouts/${id}`, {
      method: 'DELETE',
      headers: headers,
    });
    return res.json();
  },

  // --- PERIODIZACIÓN (ESTO ES LO QUE FALTABA) ---
  getPeriodizationTree: async (athleteId: string) => {
    const headers = await getAuthHeaders();
    const res = await fetch(`${BACKEND_URL}/api/periodization/tree/${athleteId}`, { headers });
    if (!res.ok) return { macros: [], unassigned_workouts: [] };
    return res.json();
  },

  createMacrociclo: async (data: any) => {
    const headers = await getAuthHeaders();
    const res = await fetch(`${BACKEND_URL}/api/macrociclos`, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(data),
    });
    return res.json();
  },

  updateMacrociclo: async (id: string, data: any) => {
    const headers = await getAuthHeaders();
    const res = await fetch(`${BACKEND_URL}/api/macrociclos/${id}`, {
      method: 'PUT',
      headers: headers,
      body: JSON.stringify(data),
    });
    return res.json();
  },

  deleteMacrociclo: async (id: string) => {
    const headers = await getAuthHeaders();
    const res = await fetch(`${BACKEND_URL}/api/macrociclos/${id}`, {
      method: 'DELETE',
      headers: headers,
    });
    return res.json();
  },

  createMicrociclo: async (data: any) => {
    const headers = await getAuthHeaders();
    const res = await fetch(`${BACKEND_URL}/api/microciclos`, {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(data),
    });
    return res.json();
  },

  updateMicrociclo: async (id: string, data: any) => {
    const headers = await getAuthHeaders();
    const res = await fetch(`${BACKEND_URL}/api/microciclos/${id}`, {
      method: 'PUT',
      headers: headers,
      body: JSON.stringify(data),
    });
    return res.json();
  },

  deleteMicrociclo: async (id: string) => {
    const headers = await getAuthHeaders();
    const res = await fetch(`${BACKEND_URL}/api/microciclos/${id}`, {
      method: 'DELETE',
      headers: headers,
    });
    return res.json();
  },

  getWellnessHistory: async (athleteId: string) => {
    const headers = await getAuthHeaders();
    const res = await fetch(`${BACKEND_URL}/api/wellness/history/${athleteId}`, { headers });
    return res.json();
  }
};
