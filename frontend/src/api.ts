import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { router } from 'expo-router';
import { syncManager } from './offline';
import { getStandardizedTestName, isLowerBetter } from './utils/tests';

const BACKEND_URL = "https://fit-tracker-backend-rtx2.onrender.com";

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

// Error con el código HTTP, para poder decidir si merece la pena reintentar
const httpError = (message: string, status?: number) => Object.assign(new Error(message), { status });

// --- WRAPPER ULTRA ROBUSTO ---
const authFetch = async (url: string, options?: RequestInit) => {
  let res;
  try {
    res = await fetch(url, options);
  } catch (e) {
    throw new Error('NETWORK_ERROR');
  }
  
  if (res.status === 401) {
    await AsyncStorage.removeItem('auth_token');
    await AsyncStorage.removeItem('user_data');
    if (Platform.OS === 'web') {
      window.location.href = '/';
    } else {
      try { router.replace('/'); } catch (e) { console.log(e); }
    }
    throw httpError('Sesión expirada. Por favor, vuelve a iniciar sesión.', 401);
  }

  if (res.status >= 500) {
    throw httpError('SERVER_ERROR', res.status);
  }

  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw httpError(errData.detail || `Error HTTP: ${res.status}`, res.status);
  }
  
  return res;
};

const shouldFallbackToOffline = (error: any) => {
  return error.message === 'NETWORK_ERROR' || error.message === 'SERVER_ERROR';
};

export const api = {
  // --- AUTENTICACIÓN ---
  login: async (email, password) => {
    const res = await fetch(`${BACKEND_URL}/api/auth/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }),
    });
    if (!res.ok) throw new Error('Credenciales incorrectas');
    return res.json();
  },
  
  googleLogin: async (googleToken: string, role: string = 'athlete') => {
    const res = await fetch(`${BACKEND_URL}/api/auth/google`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ token: googleToken, role }),
    });
    if (!res.ok) throw new Error('Error al iniciar sesión con Google');
    return await res.json();
  },

  // --- IA / GEMINI ---
  generateWorkout: async (data: { userMessage: string; athleteContext: any; chatHistory: any[] }) => {
    const headers = await getAuthHeaders();
    const res = await authFetch(`${BACKEND_URL}/api/brain/generate-workout`, {
      method: 'POST', headers, body: JSON.stringify(data),
    });
    return res.json();
  },
  
  analyzeAnalytics: async (data: any) => {
    const headers = await getAuthHeaders();
    const res = await authFetch(`${BACKEND_URL}/api/brain/analyze-analytics`, {
      method: 'POST', headers, body: JSON.stringify(data),
    });
    return res.json();
  },
  // --- WELLNESS Y ANALÍTICAS ---
  postWellness: async (data: any) => {
    const headers = await getAuthHeaders();
    const res = await authFetch(`${BACKEND_URL}/api/wellness`, {
      method: 'POST', headers, body: JSON.stringify(data),
    });
    return res.json();
  },

  getWellnessHistory: async (athleteId: string) => {
    const headers = await getAuthHeaders();
    try {
      const res = await authFetch(`${BACKEND_URL}/api/wellness/history/${athleteId}`, { headers });
      const data = await res.json();
      await syncManager.cacheData(`wellness_${athleteId}`, data);
      return data;
    } catch (e) {
      if (shouldFallbackToOffline(e)) return await syncManager.getCachedData(`wellness_${athleteId}`) || [];
      throw e;
    }
  },

  getSummary: async (athleteId?: string) => {
    const headers = await getAuthHeaders();
    const url = athleteId ? `${BACKEND_URL}/api/analytics/summary?athlete_id=${athleteId}` : `${BACKEND_URL}/api/analytics/summary`;
    try {
      const res = await authFetch(url, { headers });
      const data = await res.json();
      await syncManager.cacheData(`summary_${athleteId || 'all'}`, data);
      return data;
    } catch (e) {
      if (shouldFallbackToOffline(e)) return await syncManager.getCachedData(`summary_${athleteId || 'all'}`) || {};
      throw e;
    }
  },

  // --- ATLETAS ---
  getAthletes: async () => {
    const headers = await getAuthHeaders();
    try {
      const res = await authFetch(`${BACKEND_URL}/api/athletes`, { headers });
      const data = await res.json();
      await syncManager.cacheData('athletes_list', data);
      return data;
    } catch (e) {
      if (shouldFallbackToOffline(e)) return await syncManager.getCachedData('athletes_list') || [];
      throw e;
    }
  },

  getAthlete: async (id: string) => {
    const headers = await getAuthHeaders();
    try {
      const res = await authFetch(`${BACKEND_URL}/api/athletes/${id}`, { headers });
      const data = await res.json();
      await syncManager.cacheData(`athlete_${id}`, data);
      return data;
    } catch (e) {
      if (shouldFallbackToOffline(e)) return await syncManager.getCachedData(`athlete_${id}`);
      throw e;
    }
  },

  createAthlete: async (data: any) => {
    const headers = await getAuthHeaders();
    const res = await authFetch(`${BACKEND_URL}/api/athletes`, {
      method: 'POST', headers, body: JSON.stringify(data),
    });
    return res.json();
  },

  updateAthlete: async (id: string, data: any) => {
    const headers = await getAuthHeaders();
    const res = await authFetch(`${BACKEND_URL}/api/athletes/${id}`, {
      method: 'PUT', headers, body: JSON.stringify(data),
    });
    return res.json();
  },

  deleteAthlete: async (id: string) => {
    const headers = await getAuthHeaders();
    const res = await authFetch(`${BACKEND_URL}/api/athletes/${id}`, { method: 'DELETE', headers });
    return res.json();
  },

  updateProfile: async (data: any) => {
    const headers = await getAuthHeaders();
    const res = await authFetch(`${BACKEND_URL}/api/profile`, {
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
    try {
      const res = await authFetch(url, { headers });
      const data = await res.json();
      await syncManager.cacheData(`workouts_${params?.athlete_id || 'all'}${params?.date ? `_${params.date}` : ''}`, data);
      return data;
    } catch (e) {
      if (shouldFallbackToOffline(e)) {
        console.log('Modo offline: Cargando entrenamientos desde caché');
        const cached = await syncManager.getCachedData(`workouts_${params?.athlete_id || 'all'}${params?.date ? `_${params.date}` : ''}`);
        return cached || []; 
      }
      throw e;
    }
  },

  // queueIfOffline: false lo usa la sincronización, para que un fallo no vuelva a meter la acción en la cola
  createWorkout: async (data: any, { queueIfOffline = true } = {}) => {
    const headers = await getAuthHeaders();
    try {
      const res = await authFetch(`${BACKEND_URL}/api/workouts`, {
        method: 'POST', headers, body: JSON.stringify(data),
      });
      return await res.json();
    } catch (e) {
      if (queueIfOffline && shouldFallbackToOffline(e)) {
        console.log('Modo offline: Encolando creación');
        const tempId = `temp_${Date.now()}`;
        const offlineData = { ...data, id: tempId };
        await syncManager.savePendingAction('CREATE_WORKOUT', offlineData);
        return offlineData; 
      }
      throw e;
    }
  },

  createWorkoutsBulk: async (data: { workouts: any[] }) => {
    const headers = await getAuthHeaders();
    const res = await authFetch(`${BACKEND_URL}/api/workouts/bulk`, {
      method: 'POST', headers, body: JSON.stringify(data),
    });
    return res.json();
  },

  updateWorkout: async (id: string, data: any, { queueIfOffline = true } = {}) => {
    const headers = await getAuthHeaders();
    try {
      const res = await authFetch(`${BACKEND_URL}/api/workouts/${id}`, {
        method: 'PUT', headers, body: JSON.stringify(data),
      });
      return await res.json();
    } catch (e) {
      if (queueIfOffline && shouldFallbackToOffline(e)) {
        console.log('Modo offline: Encolando actualización');
        await syncManager.savePendingAction('UPDATE_WORKOUT', data, id);
        return { success: true, offline: true }; 
      }
      throw e;
    }
  },

  deleteWorkout: async (id: string, { queueIfOffline = true } = {}) => {
    const headers = await getAuthHeaders();
    try {
      const res = await authFetch(`${BACKEND_URL}/api/workouts/${id}`, { method: 'DELETE', headers });
      return await res.json();
    } catch (e) {
      if (queueIfOffline && shouldFallbackToOffline(e)) {
        await syncManager.savePendingAction('DELETE_WORKOUT', null, id);
        return { success: true, offline: true };
      }
      throw e;
    }
  },

  // --- PÍLDORAS (PREHAB/ACTIVACIÓN) ---
  getPills: async () => {
    const headers = await getAuthHeaders();
    try {
      const res = await authFetch(`${BACKEND_URL}/api/pills`, { headers });
      const data = await res.json();
      await syncManager.cacheData('pills_cache', data);
      return data;
    } catch (e) {
      if (shouldFallbackToOffline(e)) {
        const cached = await syncManager.getCachedData('pills_cache');
        return cached || [];
      }
      return [];
    }
  },

  createPill: async (data: any) => {
    const headers = await getAuthHeaders();
    const res = await authFetch(`${BACKEND_URL}/api/pills`, {
      method: 'POST', headers, body: JSON.stringify(data),
    });
    return await res.json();
  },

  updatePill: async (id: string, data: any) => {
    const headers = await getAuthHeaders();
    const res = await authFetch(`${BACKEND_URL}/api/pills/${id}`, {
      method: 'PUT', headers, body: JSON.stringify(data),
    });
    return await res.json();
  },

  deletePill: async (id: string) => {
    const headers = await getAuthHeaders();
    const res = await authFetch(`${BACKEND_URL}/api/pills/${id}`, { method: 'DELETE', headers });
    return await res.json();
  },

  // --- PERIODIZACIÓN ---
  getPeriodizationTree: async (athleteId: string) => {
    try {
      const headers = await getAuthHeaders();
      const res = await authFetch(`${BACKEND_URL}/api/periodization/tree/${athleteId}`, { headers });
      
      const data = await res.json();
      const result = Array.isArray(data) 
        ? { macros: data, unassigned_workouts: [] } 
        : { macros: Array.isArray(data?.macros) ? data.macros : [], unassigned_workouts: Array.isArray(data?.unassigned_workouts) ? data.unassigned_workouts : [] };
      
      await syncManager.cacheData(`tree_${athleteId}`, result);
      return result;
      
    } catch (e) {
      if (shouldFallbackToOffline(e)) {
        console.log('Modo offline: Cargando árbol desde caché');
        const cached = await syncManager.getCachedData(`tree_${athleteId}`);
        return cached || { macros: [], unassigned_workouts: [] };
      }
      return { macros: [], unassigned_workouts: [] };
    }
  },

  createMacrociclo: async (data: any) => {
    const headers = await getAuthHeaders();
    const res = await authFetch(`${BACKEND_URL}/api/macrociclos`, {
      method: 'POST', headers, body: JSON.stringify(data),
    });
    return res.json();
  },

  updateMacrociclo: async (id: string, data: any) => {
    const headers = await getAuthHeaders();
    const res = await authFetch(`${BACKEND_URL}/api/macrociclos/${id}`, {
      method: 'PUT', headers, body: JSON.stringify(data),
    });
    return res.json();
  },

  deleteMacrociclo: async (id: string) => {
    const headers = await getAuthHeaders();
    const res = await authFetch(`${BACKEND_URL}/api/macrociclos/${id}`, { method: 'DELETE', headers });
    return res.json();
  },

  createMicrociclo: async (data: any) => {
    const headers = await getAuthHeaders();
    const res = await authFetch(`${BACKEND_URL}/api/microciclos`, {
      method: 'POST', headers, body: JSON.stringify(data),
    });
    return res.json();
  },

  updateMicrociclo: async (id: string, data: any) => {
    const headers = await getAuthHeaders();
    const res = await authFetch(`${BACKEND_URL}/api/microciclos/${id}`, {
      method: 'PUT', headers, body: JSON.stringify(data),
    });
    return res.json();
  },

  deleteMicrociclo: async (id: string) => {
    const headers = await getAuthHeaders();
    const res = await authFetch(`${BACKEND_URL}/api/microciclos/${id}`, { method: 'DELETE', headers });
    return res.json();
  },

  // --- TESTS FÍSICOS ---
  // Evolución por test (pantalla /progress): agrupa los registros por nombre, del más antiguo al más reciente
  getProgress: async (athleteId: string) => {
    const tests = await api.getTests({ athlete_id: athleteId });
    const grouped: Record<string, { history: any[]; change_percent: number; lower_better: boolean }> = {};
    for (const t of Array.isArray(tests) ? tests : []) {
      const value = t.value ?? (t.value_left != null && t.value_right != null ? (t.value_left + t.value_right) / 2 : t.value_left ?? t.value_right);
      if (value == null) continue;
      const name = getStandardizedTestName(t.custom_name || t.test_name);
      (grouped[name] ||= { history: [], change_percent: 0, lower_better: isLowerBetter(name, t.unit) }).history.push({ date: t.date, value, unit: t.unit });
    }
    for (const entry of Object.values(grouped)) {
      entry.history.sort((a, b) => String(a.date).localeCompare(String(b.date)));
      const first = entry.history[0].value, last = entry.history[entry.history.length - 1].value;
      entry.change_percent = first ? Math.round(((last - first) / first) * 1000) / 10 : 0;
    }
    return grouped;
  },

  getTests: async (params?: { athlete_id?: string; test_type?: string }) => {
    const headers = await getAuthHeaders();
    let url = `${BACKEND_URL}/api/tests`;
    if (params) {
      const query = new URLSearchParams(params as any).toString();
      url += `?${query}`;
    }
    try {
      const res = await authFetch(url, { headers });
      const data = await res.json();
      await syncManager.cacheData(`tests_${params?.athlete_id || 'all'}`, data);
      return data;
    } catch (e) {
      if (shouldFallbackToOffline(e)) return await syncManager.getCachedData(`tests_${params?.athlete_id || 'all'}`) || [];
      throw e;
    }
  },

  createTest: async (data: any) => {
    const headers = await getAuthHeaders();
    const res = await authFetch(`${BACKEND_URL}/api/tests`, {
      method: 'POST', headers, body: JSON.stringify(data),
    });
    return res.json();
  },

  updateTest: async (id: string, data: any) => {
    const headers = await getAuthHeaders();
    const res = await authFetch(`${BACKEND_URL}/api/tests/${id}`, {
      method: 'PUT', headers, body: JSON.stringify(data),
    });
    return res.json();
  },

  deleteTest: async (id: string) => {
    const headers = await getAuthHeaders();
    const res = await authFetch(`${BACKEND_URL}/api/tests/${id}`, { method: 'DELETE', headers });
    return res.json();
  },
};
