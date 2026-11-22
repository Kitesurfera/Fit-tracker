// Conecta las notificaciones con la app abierta:
//  - al entrar con una cuenta, comprueba que este dispositivo sigue registrado para recibir avisos;
//  - al tocar una notificación con la app ya abierta, va a la pantalla del aviso (sin recargar la app).
import { useEffect } from 'react';
import { Platform } from 'react-native';
import { useRouter } from 'expo-router';
import { useAuth } from '../context/AuthContext';
import { syncPushSubscription } from '../utils/push';

export default function PushBridge() {
  const { user } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (Platform.OS === 'web' && user?.id) syncPushSubscription();
  }, [user?.id]);

  useEffect(() => {
    if (Platform.OS !== 'web' || typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
    const onMessage = (event: MessageEvent) => {
      const url = event.data?.type === 'OPEN_URL' ? String(event.data.url || '') : '';
      if (url.startsWith('/')) router.push(url as any);
    };
    navigator.serviceWorker.addEventListener('message', onMessage);
    return () => navigator.serviceWorker.removeEventListener('message', onMessage);
  }, [router]);

  return null;
}
