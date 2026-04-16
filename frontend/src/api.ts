import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { router } from 'expo-router';
import NetInfo from '@react-native-community/netinfo';
import { syncManager, OfflineAction } from './offline'; // <-- IMPORTAMOS EL MANAGER OFFLINE

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

const authFetch = async (url: string, options?: RequestInit) => {
  const res = await fetch(url, options);
  
  if (res.status === 401) {
    await AsyncStorage.removeItem('auth_token');
    await AsyncStorage.removeItem('user_data');
    
    if (Platform.OS === 'web') {
      window.location.href = '/';
    } else {
      try { router.replace('/'); } catch (e) { console.log(e); }
    }
    throw new Error('Sesión expirada. Por favor, vuelve a iniciar sesión.');
  }
  return res;
};

// Helper para saber si un error es por falta de internet/backend caído
const isNetworkError = (error: any) => {
  return error.message === 'Network request failed' || error.message.includes('fetch');
};

export const api = {
  // --- AUTENTICACIÓN (Obligatorio Online) ---
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

  // --- ENTRENAMIENTOS (Con soporte Offline) ---
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
      // Guardamos caché
      await syncManager.cacheData(`workouts_${params?.athlete_id || 'all'}`, data);
      return data;
    } catch (e) {
      if (isNetworkError(e)) {
        console.log('Modo offline: Cargando entrenamientos desde caché');
        const cached = await syncManager.getCachedData(`workouts_${params?.athlete_id || 'all'}`);
        return cached || []; // Si no hay caché, devolvemos array vacío para no romper la app
      }
      throw e;
    }
  },

  createWorkout: async (data: any) => {
    const headers = await getAuthHeaders();
    try {
      const res = await authFetch(`${BACKEND_URL}/api/workouts`, {
        method: 'POST', headers, body: JSON.stringify(data),
      });
      return await res.json();
    } catch (e) {
      if (isNetworkError(e)) {
        console.log('Modo offline: Encolando creación de entrenamiento');
        const tempId = `temp_${Date.now()}`;
        const offlineData = { ...data, id: tempId };
        await syncManager.savePendingAction('CREATE_WORKOUT', offlineData);
        return offlineData; // Falso positivo para la UI
      }
      throw e;
    }
  },

  updateWorkout: async (id: string, data: any) => {
    const headers = await getAuthHeaders();
    try {
      const res = await authFetch(`${BACKEND_URL}/api/workouts/${id}`, {
        method: 'PUT', headers, body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error('No se pudo actualizar el entrenamiento');
      return await res.json();
    } catch (e) {
      if (isNetworkError(e)) {
        console.log('Modo offline: Encolando actualización de entrenamiento');
        await syncManager.savePendingAction('UPDATE_WORKOUT', data, id);
        return { success: true, offline: true }; // Falso positivo para la UI
      }
      throw e;
    }
  },

  deleteWorkout: async (id: string) => {
    const headers = await getAuthHeaders();
    try {
      const res = await authFetch(`${BACKEND_URL}/api/workouts/${id}`, { method: 'DELETE', headers });
      return await res.json();
    } catch (e) {
      if (isNetworkError(e)) {
        await syncManager.savePendingAction('DELETE_WORKOUT', null, id);
        return { success: true, offline: true };
      }
      throw e;
    }
  },

  // --- PERIODIZACIÓN (Con soporte de Caché para leer Offline) ---
  getPeriodizationTree: async (athleteId: string) => {
    try {
      const headers = await getAuthHeaders();
      const res = await authFetch(`${BACKEND_URL}/api/periodization/tree/${athleteId}`, { headers });
      
      if (!res.ok) return { macros: [], unassigned_workouts: [] };
      const data = await res.json();
      
      const result = Array.isArray(data) 
        ? { macros: data, unassigned_workouts: [] } 
        : { macros: Array.isArray(data?.macros) ? data.macros : [], unassigned_workouts: Array.isArray(data?.unassigned_workouts) ? data.unassigned_workouts : [] };
      
      await syncManager.cacheData(`tree_${athleteId}`, result);
      return result;
      
    } catch (e) {
      if (isNetworkError(e)) {
        console.log('Modo offline: Cargando árbol de periodización desde caché');
        const cached = await syncManager.getCachedData(`tree_${athleteId}`);
        return cached || { macros: [], unassigned_workouts: [] };
      }
      return { macros: [], unassigned_workouts: [] };
    }
  },

  // ... (RESTO DE TUS MÉTODOS SIN CAMBIOS IMPORTANTES, ej: wellness, uploadFile, athletes. 
  // Puedes aplicar este mismo patrón try/catch a los tests físicos si lo deseas).
  
  getAthletes: async () => {
    const headers = await getAuthHeaders();
    try {
      const res = await authFetch(`${BACKEND_URL}/api/athletes`, { headers });
      const data = await res.json();
      await syncManager.cacheData('athletes_list', data);
      return data;
    } catch (e) {
      if (isNetworkError(e)) return await syncManager.getCachedData('athletes_list') || [];
      throw e;
    }
  },

  // Copia el resto de tus métodos originales aquí debajo (uploadFile, wellness, etc.)
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

    const res = await authFetch(`${BACKEND_URL}/api/upload`, { 
      method: 'POST', headers, body: formData,
    });
    
    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`Fallo en el servidor: ${errorText}`);
    }
    return res.json();
  }
};
