import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { api } from './api'; 

const PENDING_ACTIONS_KEY = 'PENDING_OFFLINE_ACTIONS';
const CACHE_PREFIX = 'CACHE_';

export type OfflineAction = 'CREATE_WORKOUT' | 'UPDATE_WORKOUT' | 'DELETE_WORKOUT' | 'UPDATE_PROFILE';

export const syncManager = {
  // 1. Guardar cualquier acción pendiente en la cola
  savePendingAction: async (actionType: OfflineAction, data: any, targetId?: string) => {
    try {
      const stored = await AsyncStorage.getItem(PENDING_ACTIONS_KEY);
      const pending = stored ? JSON.parse(stored) : [];
      
      pending.push({ 
        actionType, 
        data, 
        targetId, 
        timestamp: Date.now() 
      });
      
      await AsyncStorage.setItem(PENDING_ACTIONS_KEY, JSON.stringify(pending));
      console.log(`Acción offline guardada en cola: ${actionType}`);
    } catch (e) {
      console.error('Error guardando acción offline:', e);
    }
  },

  // 2. Intenta subir todo lo pendiente cuando vuelva la conexión
  syncPendingActions: async () => {
    const netState = await NetInfo.fetch();
    if (!netState.isConnected) {
      console.log('No hay conexión, saltando sincronización...');
      return;
    }

    try {
      const stored = await AsyncStorage.getItem(PENDING_ACTIONS_KEY);
      if (!stored) return;
      
      const pending = JSON.parse(stored);
      if (pending.length === 0) return;

      console.log(`Intentando sincronizar ${pending.length} acciones pendientes...`);
      const failedActions = [];

      for (const item of pending) {
        try {
          // Resolvemos qué endpoint tocar en base a la acción
          switch (item.actionType) {
            case 'UPDATE_WORKOUT':
              await api.updateWorkout(item.targetId, item.data);
              break;
            case 'CREATE_WORKOUT':
              // Si el ID era temporal (empieza por temp_), lo borramos para que la DB cree uno real
              const payload = { ...item.data };
              if (payload.id && payload.id.toString().startsWith('temp_')) {
                delete payload.id;
              }
              await api.createWorkout(payload);
              break;
            case 'DELETE_WORKOUT':
              await api.deleteWorkout(item.targetId);
              break;
            // Aquí puedes añadir más casos (ej. UPDATE_WELLNESS)
          }
        } catch (err) {
          console.error(`Error sincronizando acción ${item.actionType}:`, err);
          // Si el servidor da error (ej. 500), nos lo guardamos para reintentar luego
          failedActions.push(item); 
        }
      }

      // Actualizamos la cola: borramos lo exitoso y dejamos lo que falló
      if (failedActions.length > 0) {
        await AsyncStorage.setItem(PENDING_ACTIONS_KEY, JSON.stringify(failedActions));
        console.log(`Quedan ${failedActions.length} acciones pendientes por errores del servidor.`);
      } else {
        await AsyncStorage.removeItem(PENDING_ACTIONS_KEY);
        console.log('Sincronización offline completada con éxito. Cola limpia.');
      }
      
    } catch (e) {
      console.error('Error general en la sincronización:', e);
    }
  },

  // 3. Sistema de Caché Local (para cargar pantallas sin internet)
  cacheData: async (key: string, data: any) => {
    try {
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
  }
};
