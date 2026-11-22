// Notificaciones en el móvil (también con la app cerrada) para la versión web instalada (PWA).
//
// Cómo funciona: el navegador del móvil nos da una "dirección" única para este dispositivo (suscripción) y la
// guardamos en el servidor. Cuando pasa algo (nueva sesión, sesión terminada, bienestar, vídeo…), el servidor manda
// el aviso a esa dirección y el service worker (public/sw.js) lo muestra aunque la app esté cerrada.
//
//  - iPhone/iPad: solo funciona con la app añadida a la pantalla de inicio (iOS 16.4 o posterior).
//  - Android y ordenador: funciona en Chrome, Edge y Firefox.
import { Platform } from 'react-native';
import { api } from '../api';

export type PushSupport = 'ok' | 'ios-install' | 'ios-update' | 'unsupported' | 'dev';

const isWeb = () => Platform.OS === 'web' && typeof window !== 'undefined' && typeof navigator !== 'undefined';

export const isIos = () => {
  if (!isWeb()) return false;
  const ua = navigator.userAgent || '';
  return /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && (navigator as any).maxTouchPoints > 1);
};

export const isStandalone = () => {
  if (!isWeb()) return false;
  return !!(window.matchMedia?.('(display-mode: standalone)').matches || (navigator as any).standalone);
};

export const pushSupport = (): PushSupport => {
  if (!isWeb()) return 'unsupported';
  if (__DEV__) return 'dev';
  const apis = 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
  if (isIos()) {
    if (!isStandalone()) return 'ios-install';
    return apis ? 'ok' : 'ios-update';
  }
  return apis ? 'ok' : 'unsupported';
};

export const permissionState = (): NotificationPermission | 'unsupported' =>
  isWeb() && 'Notification' in window ? Notification.permission : 'unsupported';

// Nombre del dispositivo para la lista del servidor ("iPhone · Safari", "Android · Chrome"…)
export const deviceName = () => {
  if (!isWeb()) return '';
  const ua = navigator.userAgent || '';
  const os = isIos() ? (/iPad/.test(ua) ? 'iPad' : 'iPhone') : /Android/.test(ua) ? 'Android' : /Windows/.test(ua) ? 'Windows' : /Mac/.test(ua) ? 'Mac' : /Linux/.test(ua) ? 'Linux' : 'Otro';
  const browser = /Edg\//.test(ua) ? 'Edge' : /Firefox\//.test(ua) ? 'Firefox' : /SamsungBrowser/.test(ua) ? 'Samsung Internet' : /Chrome\//.test(ua) ? 'Chrome' : /Safari\//.test(ua) ? 'Safari' : 'Navegador';
  return `${os} · ${browser}`;
};

const b64ToBytes = (b64: string) => {
  const s = (b64 + '='.repeat((4 - (b64.length % 4)) % 4)).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(s);
  return Uint8Array.from(raw, c => c.charCodeAt(0));
};

const sameKey = (sub: PushSubscription, publicKey: string) => {
  try {
    const current = sub.options?.applicationServerKey;
    if (!current) return true; // el navegador no la dice: damos por buena la suscripción
    const a = new Uint8Array(current as ArrayBuffer), b = b64ToBytes(publicKey);
    return a.length === b.length && a.every((v, i) => v === b[i]);
  } catch { return true; }
};

const getRegistration = async () => {
  const existing = await navigator.serviceWorker.getRegistration('/');
  const reg = existing || (await navigator.serviceWorker.register('/sw.js'));
  return navigator.serviceWorker.ready.then(() => reg);
};

export const getDeviceSubscription = async (): Promise<PushSubscription | null> => {
  if (pushSupport() !== 'ok') return null;
  try {
    const reg = await navigator.serviceWorker.getRegistration('/');
    return (await reg?.pushManager.getSubscription()) || null;
  } catch { return null; }
};

// Pide permiso (tiene que ser lo PRIMERO al tocar el botón: el iPhone solo lo deja justo tras un toque)
export const requestPermission = async (): Promise<NotificationPermission> => {
  if (!('Notification' in window)) return 'denied';
  if (Notification.permission !== 'default') return Notification.permission;
  return Notification.requestPermission();
};

// Activa los avisos en este dispositivo y lo registra en el servidor
export const enablePushOnDevice = async (publicKey: string) => {
  const permission = await requestPermission();
  if (permission !== 'granted') return { ok: false as const, permission };
  const reg = await getRegistration();
  let sub = await reg.pushManager.getSubscription();
  if (sub && !sameKey(sub, publicKey)) { await sub.unsubscribe().catch(() => {}); sub = null; }
  if (!sub) sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToBytes(publicKey) });
  const res = await api.pushSubscribe(sub.toJSON(), deviceName());
  return { ok: true as const, permission, devices: res.devices as number };
};

// Desactiva los avisos en este dispositivo (y lo quita del servidor)
export const disablePushOnDevice = async () => {
  const sub = await getDeviceSubscription();
  if (!sub) return;
  try { await api.pushUnsubscribe(sub.endpoint); } catch {}
  await sub.unsubscribe().catch(() => {});
};

// Al abrir la app: si este dispositivo ya tenía los avisos activados, nos aseguramos de que el servidor lo sabe
// (y si el servidor cambió de clave, se vuelve a suscribir solo). No pide permiso nunca.
export const syncPushSubscription = async () => {
  try {
    if (pushSupport() !== 'ok' || Notification.permission !== 'granted') return;
    const sub = await getDeviceSubscription();
    if (!sub) return;
    const { public_key } = await api.getPushConfig();
    if (!sameKey(sub, public_key)) { await enablePushOnDevice(public_key); return; }
    await api.pushSubscribe(sub.toJSON(), deviceName());
  } catch (e) {
    console.log('No se pudo sincronizar las notificaciones', e);
  }
};

// Al cerrar sesión: este dispositivo deja de recibir los avisos de esa cuenta (como mucho esperamos 3 s)
export const forgetPushOnLogout = () =>
  Promise.race([disablePushOnDevice().catch(() => {}), new Promise(r => setTimeout(r, 3000))]);
