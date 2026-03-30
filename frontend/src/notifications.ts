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
    // Verificamos si el navegador soporta notificaciones
    if (!('Notification' in window)) {
      console.log('Este navegador no soporta notificaciones web.');
      return false;
    }
    const permission = await Notification.requestPermission();
    return permission === 'granted';
  } else {
    // Dispositivos nativos (iOS/Android)
    const { status } = await Notifications.requestPermissionsAsync();
    return status === 'granted';
  }
}

export async function scheduleDailyWellnessReminder() {
  const hasPermission = await requestNotificationPermissions();
  if (!hasPermission) {
    console.log("No se concedieron permisos de notificación.");
    return;
  }

  // Cancelamos avisos anteriores para no acumular spam
  await Notifications.cancelAllScheduledNotificationsAsync();

  // Programamos el aviso para las 9:30 AM todos los días
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

// Función extra para probar que funciona en el momento
export async function testNotification() {
  const hasPermission = await requestNotificationPermissions();
  if (!hasPermission) return;

  await Notifications.scheduleNotificationAsync({
    content: {
      title: "¡Notificaciones activadas! 🚀",
      body: "Si ves esto, tu dispositivo está listo para recibir avisos.",
    },
    trigger: null, // null significa que salta inmediatamente
  });
}
