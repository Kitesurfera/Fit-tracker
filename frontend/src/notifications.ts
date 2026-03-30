import * as Notifications from 'expo-notifications';
import { Platform, Alert } from 'react-native';
import Constants from 'expo-constants';

// Esto le dice a la app cómo comportarse si la notificación llega mientras la estás usando
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export async function requestNotificationPermissions() {
  if (Platform.OS === 'web') {
    if (!('Notification' in window)) {
      console.log('Este navegador no soporta notificaciones web.');
      window.alert('Tu navegador no soporta notificaciones web.');
      return false;
    }
    
    // Si estamos en Safari iOS normal, esto suele fallar o ser denegado automáticamente
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      window.alert('Permiso denegado. En Safari iOS, debes añadir la web a la pantalla de inicio primero.');
    }
    return permission === 'granted';
  } else {
    const { status } = await Notifications.requestPermissionsAsync();
    return status === 'granted';
  }
}

// --- GENERACIÓN DEL TOKEN UNIVERSAL ---
export async function getExpoToken() {
  const hasPermission = await requestNotificationPermissions();
  if (!hasPermission) return null;

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'default',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#FF231F7C',
    });
  }

  try {
    // Intentamos extraer el ID del proyecto directamente de la configuración de Expo
    const projectId = 
      Constants?.expoConfig?.extra?.eas?.projectId || 
      Constants?.easConfig?.projectId;

    // Obtiene el token de Expo usando el ID del proyecto
    const tokenData = await Notifications.getExpoPushTokenAsync({
      projectId: projectId, 
    });
    
    return tokenData.data;
  } catch (error) {
    console.error("Error obteniendo el Push Token de Expo:", error);
    
    if (Platform.OS === 'web') {
      window.alert("Fallo al generar token web. Expo Push requiere configuración adicional (VAPID) para funcionar en navegadores.");
    }
    
    return null;
  }
}

export async function scheduleDailyWellnessReminder() {
  const hasPermission = await requestNotificationPermissions();
  if (!hasPermission) return;

  await Notifications.cancelAllScheduledNotificationsAsync();

  await Notifications.scheduleNotificationAsync({
    content: {
      title: "¡Buenos días! 🌊",
      body: "¿Cómo te has levantado hoy? Entra a registrar tu fatiga para ajustar la sesión.",
      sound: true,
    },
    trigger: {
      hour: 9,
      minute: 30,
      repeats: true,
    },
  });
  
  console.log("Recordatorio diario programado a las 9:30 AM");
}

export async function testNotification() {
  const hasPermission = await requestNotificationPermissions();
  if (!hasPermission) return;

  await Notifications.scheduleNotificationAsync({
    content: {
      title: "¡Notificaciones activadas! 🚀",
      body: "Si ves esto, tu dispositivo está listo para recibir avisos.",
    },
    trigger: null, 
  });
}
