import AsyncStorage from '@react-native-async-storage/async-storage';

export const offlineManager = {
  // Guardar entrenamientos para el modo offline
  saveWorkouts: async (workouts: any[]) => {
    try {
      await AsyncStorage.setItem('offline_workouts', JSON.stringify(workouts));
      await AsyncStorage.setItem('last_sync', new Date().toISOString());
    } catch (e) {
      console.error("Error guardando datos offline", e);
    }
  },

  // Recuperar entrenamientos si no hay red
  getWorkouts: async () => {
    const data = await AsyncStorage.getItem('offline_workouts');
    return data ? JSON.parse(data) : [];
  },

  // Guardar un entrenamiento completado mientras estamos offline
  savePendingCompletion: async (workoutId: string, data: any) => {
    const pending = await AsyncStorage.getItem('pending_sync') || '[]';
    const list = JSON.parse(pending);
    list.push({ workoutId, data, timestamp: new Date().toISOString() });
    await AsyncStorage.setItem('pending_sync', JSON.stringify(list));
  }
};
