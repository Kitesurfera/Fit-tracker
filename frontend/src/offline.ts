import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import { api } from './api'; 

const PENDING_WORKOUTS_KEY = 'PENDING_OFFLINE_WORKOUTS';

export const syncManager = {
  // 1. Guarda un entreno completado en la cola local si no hay internet
  savePendingWorkout: async (workoutId: string, updateData: any) => {
    try {
      const stored = await AsyncStorage.getItem(PENDING_WORKOUTS_KEY);
      const pending = stored ? JSON.parse(stored) : [];
      
      pending.push({ workoutId, updateData, timestamp: Date.now() });
      await AsyncStorage.setItem(PENDING_WORKOUTS_KEY, JSON.stringify(pending));
      
      console.log('Entrenamiento guardado en cola offline listos para subir luego.');
    } catch (e) {
      console.error('Error guardando en offline:', e);
    }
  },

  // 2. Intenta subir todo lo pendiente cuando vuelva la conexión
  syncPendingWorkouts: async () => {
    const netState = await NetInfo.fetch();
    if (!netState.isConnected) {
      console.log('No hay conexión, saltando sincronización...');
      return;
    }

    try {
      const stored = await AsyncStorage.getItem(PENDING_WORKOUTS_KEY);
      if (!stored) return;
      
      const pending = JSON.parse(stored);
      if (pending.length === 0) return;

      console.log(`Intentando sincronizar ${pending.length} entrenamientos pendientes...`);

      // Subimos cada entrenamiento pendiente a la API
      for (const item of pending) {
        await api.updateWorkout(item.workoutId, item.updateData);
      }

      // Si el bucle termina sin errores, limpiamos la cola local
      await AsyncStorage.removeItem(PENDING_WORKOUTS_KEY);
      console.log('Sincronización offline completada con éxito.');
      
    } catch (e) {
      console.error('Error en la sincronización. Se reintentará más tarde:', e);
      // Si falla por cualquier motivo, los datos siguen seguros en AsyncStorage para el próximo intento.
    }
  }
};
