import { api } from './api';

const PUBLIC_VAPID_KEY = 'BDIM3jiE8Q2kvtdHlRLADtTqTJk84y9xgtgl5AlO9qGviDzAcsJw7oW8bCOOXMTJGEOqTrZIvXmp_mLWVBC7bO8';

function urlBase64ToUint8Array(base64String: string) {
  const padding = '='.repeat((4 - base64String.length % 4) % 4);
  const base64 = (base64String + padding)
    .replace(/\-/g, '+')
    .replace(/_/g, '/');

  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);

  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

export async function subscribeToWebPush() {
  if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
    console.log('Web Push no está soportado en este navegador.');
    return;
  }

  try {
    // Pedimos permiso
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') {
      console.log('Permiso de notificaciones denegado.');
      return;
    }

    // Esperamos a que el Service Worker esté listo
    const registration = await navigator.serviceWorker.ready;
    
    // Nos suscribimos al servidor de Push de Apple/Google
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(PUBLIC_VAPID_KEY)
    });

    // Enviamos el ticket a TU servidor
    await api.subscribeWebPush(subscription.toJSON());
    console.log('¡Suscripción Web Push completada con éxito!');
    
  } catch (error) {
    console.error('Error suscribiendo a Web Push:', error);
  }
}
