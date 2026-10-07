import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { Platform } from 'react-native';
import { api } from './api';

const PENDING_ACTIONS_KEY = 'PENDING_OFFLINE_ACTIONS';
const CACHE_PREFIX = 'CACHE_';

export type OfflineAction = 'CREATE_WORKOUT' | 'UPDATE_WORKOUT' | 'DELETE_WORKOUT' | 'UPDATE_PROFILE';

type PendingItem = { actionType: OfflineAction; data: any; targetId?: string; userId?: string; timestamp: number };
type SyncStatus = { pendingCount: number; syncing: boolean };

let status: SyncStatus = { pendingCount: 0, syncing: false };
let syncInProgress: Promise<void> | null = null;
const listeners = new Set<(s: SyncStatus) => void>();

const setStatus = (partial: Partial<SyncStatus>) => {
  status = { ...status, ...partial };
  listeners.forEach(fn => fn(status));
};

const readPending = async (): Promise<PendingItem[]> => {
  const stored = await AsyncStorage.getItem(PENDING_ACTIONS_KEY);
  return stored ? JSON.parse(stored) : [];
};

const writePending = async (pending: PendingItem[]) => {
  if (pending.length > 0) await AsyncStorage.setItem(PENDING_ACTIONS_KEY, JSON.stringify(pending));
  else await AsyncStorage.removeItem(PENDING_ACTIONS_KEY);
  setStatus({ pendingCount: pending.length });
};

const getCurrentUserId = async (): Promise<string | null> => {
  try {
    const stored = await AsyncStorage.getItem('user_data');
    return stored ? JSON.parse(stored).id : null;
  } catch (e) {
    return null;
  }
};

// Sin conexión, error del servidor (5xx) o sesión caducada (401): se reintenta más tarde.
// Cualquier otro error (p. ej. la sesión ya no existe) no se arreglará reintentando, así que se descarta.
const shouldRetry = (err: any) => !err?.status || err.status >= 500 || err.status === 401;

// En el navegador, navigator.onLine es la fuente fiable (NetInfo puede quedarse con el estado antiguo en Chrome)
const isOnlineNow = async () => {
  if (Platform.OS === 'web' && typeof navigator !== 'undefined') return navigator.onLine;
  return (await NetInfo.fetch()).isConnected !== false;
};

const runSync = async () => {
  if (!(await isOnlineNow())) return;
  if (!(await AsyncStorage.getItem('auth_token'))) return;

  const pending = await readPending();
  if (pending.length === 0) return;

  const userId = await getCurrentUserId();
  const tempIdMap: Record<string, string> = {};
  const remaining: PendingItem[] = [];
  let stop = false;

  setStatus({ syncing: true });
  for (const item of pending) {
    // Acciones guardadas por otra cuenta en este dispositivo: no se pueden subir con la sesión actual.
    if (item.userId && userId && item.userId !== userId) continue;
    if (stop) { remaining.push(item); continue; }

    const targetId = item.targetId && tempIdMap[item.targetId] ? tempIdMap[item.targetId] : item.targetId;
    try {
      switch (item.actionType) {
        case 'CREATE_WORKOUT': {
          const payload = { ...item.data };
          const tempId = payload.id?.toString().startsWith('temp_') ? payload.id : null;
          delete payload.id;
          const created = await api.createWorkout(payload, { queueIfOffline: false });
          if (tempId && created?.id) tempIdMap[tempId] = created.id;
          break;
        }
        case 'UPDATE_WORKOUT':
          if (targetId?.startsWith('temp_')) throw Object.assign(new Error('Sesión temporal no creada'), { status: 404 });
          await api.updateWorkout(targetId!, item.data, { queueIfOffline: false });
          break;
        case 'DELETE_WORKOUT':
          if (targetId?.startsWith('temp_')) break;
          await api.deleteWorkout(targetId!, { queueIfOffline: false });
          break;
      }
    } catch (err: any) {
      if (shouldRetry(err)) {
        remaining.push(item);
        // Si se ha perdido la conexión o la sesión, no tiene sentido seguir intentando el resto ahora.
        if (!err?.status || err.status === 401) stop = true;
      } else {
        console.error(`Acción offline descartada (${item.actionType}):`, err?.message);
      }
    }
  }

  await writePending(remaining);
  setStatus({ syncing: false });
};

export const syncManager = {
  // 1. Guardar cualquier acción pendiente en la cola
  savePendingAction: async (actionType: OfflineAction, data: any, targetId?: string) => {
    try {
      const pending = await readPending();
      pending.push({ actionType, data, targetId, userId: (await getCurrentUserId()) || undefined, timestamp: Date.now() });
      await writePending(pending);
    } catch (e) {
      console.error('Error guardando acción offline:', e);
    }
  },

  // 2. Intenta subir todo lo pendiente cuando vuelva la conexión (nunca dos veces a la vez)
  syncPendingActions: async () => {
    if (!syncInProgress) {
      syncInProgress = runSync()
        .catch(e => { console.error('Error general en la sincronización:', e); setStatus({ syncing: false }); })
        .finally(() => { syncInProgress = null; });
    }
    return syncInProgress;
  },

  getPendingCount: async () => {
    try {
      const pending = await readPending();
      setStatus({ pendingCount: pending.length });
      return pending.length;
    } catch (e) {
      return 0;
    }
  },

  // Permite a la interfaz enterarse de cuántos cambios faltan por subir
  subscribe: (fn: (s: SyncStatus) => void) => {
    listeners.add(fn);
    fn(status);
    return () => { listeners.delete(fn); };
  },

  // 3. Sistema de Caché Local (para cargar pantallas sin internet)
  cacheData: async (key: string, data: any) => {
    try {
      // Si la sesión se acaba de cerrar, no guardamos respuestas que lleguen tarde
      if (!(await AsyncStorage.getItem('auth_token'))) return;
      await AsyncStorage.setItem(`${CACHE_PREFIX}${key}`, JSON.stringify(data));
    } catch (e) {
      console.error(`Error guardando caché para ${key}:`, e);
    }
  },

  getCachedData: async (key: string) => {
    try {
      const data = await AsyncStorage.getItem(`${CACHE_PREFIX}${key}`);
      return data ? JSON.parse(data) : null;
    } catch (e) {
      console.error(`Error leyendo caché para ${key}:`, e);
      return null;
    }
  },

  // Borra los datos de la sesión (caché y cola), pero no las preferencias ni las plantillas del dispositivo
  clearUserData: async () => {
    const keys = await AsyncStorage.getAllKeys();
    const userKeys = keys.filter(k => k.startsWith(CACHE_PREFIX) || k === PENDING_ACTIONS_KEY);
    await AsyncStorage.multiRemove(userKeys);
    setStatus({ pendingCount: 0 });
  },
};
