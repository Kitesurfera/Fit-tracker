import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

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
      return false;
    }
    const permission = await Notification.requestPermission();
    return permission === 'granted';
  } else {
    const { status } = await Notifications.requestPermissionsAsync();
    return status === 'granted';
  }
}

// --- NUEVA FUNCION: Genera el token universal ---
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
    // Obtiene el token de Expo (Sirve para Web, iOS y Android)
    // Nota: Si usas EAS Build, Expo inyecta el projectId automáticamente.
    const tokenData = await Notifications.getExpoPushTokenAsync();
    return tokenData.data;
  } catch (error) {
    console.error("Error obteniendo el Push Token de Expo:", error);
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
