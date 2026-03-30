import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';

const BACKEND_URL = process.env.EXPO_PUBLIC_BACKEND_URL;

const getAuthHeaders = async () => {
  try {
    const token = await AsyncStorage.getItem('auth_token');
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    };
  } catch (e) {
    return { 'Content-Type': 'application/json' };
  }
};

export const api = {
  // --- AUTENTICACIÓN ---
  login: async (email, password) => {
    const res = await fetch(`${BACKEND_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    if (!res.ok) throw new Error('Credenciales incorrectas');
    return res.json();
  },

  googleLogin: async (googleToken: string, role: string = 'athlete') => {
    try {
      const response = await fetch(`${BACKEND_URL}/api/auth/google`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token: googleToken, role }),
      });
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.detail || 'Error al iniciar sesión con Google');
      }
      return await response.json();
    } catch (error) {
      console.error('API Google Login Error:', error);
      throw error;
    }
  },

  // --- NOTIFICACIONES PUSH ---
  subscribeWebPush: async (subscriptionData: any) => {
    const headers = await getAuthHeaders();
    const res = await fetch(`${BACKEND_URL}/api/notifications/subscribe`, {
      method: 'POST',
      headers,
      body: JSON.stringify(subscriptionData),
    });
    return res.json();
  },

  testWebPush: async () => {
    const headers = await getAuthHeaders();
    const res = await fetch(`${BACKEND_URL}/api/notifications/test`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ title: "¡Prueba!", message: "El sistema Web Push funciona." }),
    });
    return res.json();
  },

  // --- WELLNESS ---
  postWellness: async (data: any) => {
    const headers = await getAuthHeaders();
    const res = await fetch(`${BACKEND_URL}/api/wellness`, {
      method: 'POST', headers, body: JSON.stringify(data),
    });
    if (!res.ok) {
      const errorData = await res.json();
      throw new Error(errorData.detail || 'Error al guardar el estado');
    }
    return res.json();
  },

  getWellnessHistory: async (athleteId: string) => {
    const headers = await getAuthHeaders();
    const res = await fetch(`${BACKEND_URL}/api/wellness/history/${athleteId}`, { headers });
    if (!res.ok) throw new Error('No se pudo obtener el historial');
    return res.json();
  },

  getSummary: async (athleteId?: string) => {
    const headers = await getAuthHeaders();
    const url = athleteId ? `${BACKEND_URL}/api/analytics/summary?athlete_id=${athleteId}` : `${BACKEND_URL}/api/analytics/summary`;
    const res = await fetch(url, { headers });
    return res.json();
  },

  // --- ATLETAS ---
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
      method: 'POST', headers, body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error('Error al crear deportista');
    return res.json();
  },

  updateAthlete: async (id: string, data: any) => {
    const headers = await getAuthHeaders();
    const res = await fetch(`${BACKEND_URL}/api/athletes/${id}`, {
      method: 'PUT', headers, body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error('Error al actualizar deportista');
    return res.json();
  },

  deleteAthlete: async (id: string) => {
    const headers = await getAuthHeaders();
    const res = await fetch(`${BACKEND_URL}/api/athletes/${id}`, {
      method: 'DELETE', headers,
    });
    if (!res.ok) throw new Error('Error al eliminar deportista');
    return res.json();
  },

  updateProfile: async (data: any) => {
    const headers = await getAuthHeaders();
    const res = await fetch(`${BACKEND_URL}/api/profile`, {
      method: 'PUT', headers, body: JSON.stringify(data),
    });
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
      method: 'POST', headers, body: JSON.stringify(data),
    });
    return res.json();
  },

  createWorkoutsBulk: async (data: { workouts: any[] }) => {
    const headers = await getAuthHeaders();
    const res = await fetch(`${BACKEND_URL}/api/workouts/bulk`, {
      method: 'POST', headers, body: JSON.stringify(data),
    });
    return res.json();
  },

  updateWorkout: async (id: string, data: any) => {
    const headers = await getAuthHeaders();
    const res = await fetch(`${BACKEND_URL}/api/workouts/${id}`, {
      method: 'PUT', headers, body: JSON.stringify(data),
    });
    if (!res.ok) throw new Error('No se pudo actualizar el entrenamiento');
    return res.json();
  },

  deleteWorkout: async (id: string) => {
    const headers = await getAuthHeaders();
    const res = await fetch(`${BACKEND_URL}/api/workouts/${id}`, { method: 'DELETE', headers });
    return res.json();
  },

  // --- PERIODIZACIÓN ---
  getPeriodizationTree: async (athleteId: string) => {
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`${BACKEND_URL}/api/periodization/tree/${athleteId}`, { headers });
      
      if (!res.ok) {
        console.warn(`Error API Tree (Status: ${res.status})`);
        return { macros: [], unassigned_workouts: [] };
      }
      
      const data = await res.json();
      
      if (Array.isArray(data)) {
        return { macros: data, unassigned_workouts: [] };
      }
      
      return { 
        macros: Array.isArray(data?.macros) ? data.macros : [], 
        unassigned_workouts: Array.isArray(data?.unassigned_workouts) ? data.unassigned_workouts : [] 
      };
      
    } catch (e) {
      console.error("Error catched in API Tree:", e);
      return { macros: [], unassigned_workouts: [] };
    }
  },

  createMacrociclo: async (data: any) => {
    const headers = await getAuthHeaders();
    const res = await fetch(`${BACKEND_URL}/api/macrociclos`, {
      method: 'POST', headers, body: JSON.stringify(data),
    });
    return res.json();
  },

  updateMacrociclo: async (id: string, data: any) => {
    const headers = await getAuthHeaders();
    const res = await fetch(`${BACKEND_URL}/api/macrociclos/${id}`, {
      method: 'PUT', headers, body: JSON.stringify(data),
    });
    return res.json();
  },

  deleteMacrociclo: async (id: string) => {
    const headers = await getAuthHeaders();
    const res = await fetch(`${BACKEND_URL}/api/macrociclos/${id}`, { method: 'DELETE', headers });
    return res.json();
  },

  createMicrociclo: async (data: any) => {
    const headers = await getAuthHeaders();
    const res = await fetch(`${BACKEND_URL}/api/microciclos`, {
      method: 'POST', headers, body: JSON.stringify(data),
    });
    return res.json();
  },

  updateMicrociclo: async (id: string, data: any) => {
    const headers = await getAuthHeaders();
    const res = await fetch(`${BACKEND_URL}/api/microciclos/${id}`, {
      method: 'PUT', headers, body: JSON.stringify(data),
    });
    return res.json();
  },

  deleteMicrociclo: async (id: string) => {
    const headers = await getAuthHeaders();
    const res = await fetch(`${BACKEND_URL}/api/microciclos/${id}`, { method: 'DELETE', headers });
    return res.json();
  },

  // --- TESTS FÍSICOS ---
  getTests: async (params?: { athlete_id?: string; test_type?: string }) => {
    const headers = await getAuthHeaders();
    let url = `${BACKEND_URL}/api/tests`;
    if (params) {
      const query = new URLSearchParams(params as any).toString();
      url += `?${query}`;
    }
    const res = await fetch(url, { headers });
    if (!res.ok) throw new Error('Error al obtener los tests');
    return res.json();
  },

  createTest: async (data: any) => {
    const headers = await getAuthHeaders();
    const res = await fetch(`${BACKEND_URL}/api/tests`, {
      method: 'POST', headers, body: JSON.stringify(data),
    });
    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      throw new Error(errorData.detail ? JSON.stringify(errorData.detail) : 'Error al registrar el test');
    }
    return res.json();
  },

  updateTest: async (id: string, data: any) => {
    const headers = await getAuthHeaders();
    const res = await fetch(`${BACKEND_URL}/api/tests/${id}`, {
      method: 'PUT', headers, body: JSON.stringify(data),
    });
    if (!res.ok) {
      const errorData = await res.json().catch(() => ({}));
      throw new Error(errorData.detail ? JSON.stringify(errorData.detail) : 'Error al actualizar el test');
    }
    return res.json();
  },

  deleteTest: async (id: string) => {
    const headers = await getAuthHeaders();
    const res = await fetch(`${BACKEND_URL}/api/tests/${id}`, { method: 'DELETE', headers });
    if (!res.ok) throw new Error('Error al eliminar el test');
    return res.json();
  },

  // --- SUBIDA DE ARCHIVOS ---
  uploadFile: async (asset: any) => {
    const headers: any = await getAuthHeaders();
    delete headers['Content-Type']; 

    const formData = new FormData();

    if (Platform.OS === 'web') {
      if (asset.file) {
        formData.append('file', asset.file);
      } else {
        const response = await fetch(asset.uri);
        const blob = await response.blob();
        formData.append('file', blob, asset.fileName || 'video.mp4');
      }
    } else {
      formData.append('file', {
        uri: Platform.OS === 'android' ? asset.uri : asset.uri.replace('file://', ''),
        name: asset.fileName || asset.uri.split('/').pop() || 'video.mp4',
        type: asset.mimeType || 'video/mp4',
      } as any);
    }

    const res = await fetch(`${BACKEND_URL}/api/upload`, { 
      method: 'POST',
      headers,
      body: formData,
    });
    
    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`Fallo en el servidor: ${errorText}`);
    }
    return res.json();
  }
};
