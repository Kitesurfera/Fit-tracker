import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

// Tu clave pública de vapidkeys.com
const VAPID_PUBLIC_KEY = "PEGA_AQUI_TU_CLAVE_PUBLICA";

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

// Función matemática necesaria para el navegador
function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding).replace(/\-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export async function requestNotificationPermissions() {
  if (Platform.OS === 'web') {
    if (!('Notification' in window)) {
      window.alert('Tu navegador no soporta notificaciones web.');
      return false;
    }
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      window.alert('Permiso denegado. En iOS, recuerda que debes pulsar "Compartir > Añadir a la pantalla de inicio" para que funcione.');
    }
    return permission === 'granted';
  }
  return false;
}

// --- GENERACIÓN DEL TOKEN WEB PURO ---
export async function getWebPushSubscription() {
  const hasPermission = await requestNotificationPermissions();
  if (!hasPermission) return null;

  try {
    if ('serviceWorker' in navigator) {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY)
      });
      return subscription.toJSON(); // Esto es el objeto exacto que necesita Python
    }
  } catch (error) {
    console.error("Error obteniendo la suscripción web:", error);
    return null;
  }
}

export async function testNotification() {
  const hasPermission = await requestNotificationPermissions();
  if (!hasPermission) return;

  await Notifications.scheduleNotificationAsync({
    content: {
      title: "¡Notificaciones activadas! 🚀",
      body: "Si ves esto, tu navegador está listo para recibir avisos.",
    },
    trigger: null, 
  });
}
