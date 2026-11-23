// Datos técnicos que se adjuntan a un informe de problema (para poder reproducir el fallo).
// No incluye contraseñas ni datos de entrenamiento: solo dispositivo, navegador, versión de la app y errores recientes.
import { Platform, Dimensions } from 'react-native';
import Constants from 'expo-constants';
import { syncManager } from '../offline';
import { BACKEND_URL } from '../config';
import { deviceName, isStandalone, permissionState } from './push';

const MAX_ERRORS = 10;
const recentErrors: string[] = [];
let installed = false;

const remember = (msg: string) => {
  const line = `${new Date().toLocaleTimeString('es-ES')} ${msg}`.slice(0, 300);
  recentErrors.push(line);
  if (recentErrors.length > MAX_ERRORS) recentErrors.shift();
};

// Se llama al abrir la app: guarda en memoria los últimos errores (no se envían a ningún sitio salvo en un informe)
export function installErrorBuffer() {
  if (installed || Platform.OS !== 'web' || typeof window === 'undefined') return;
  installed = true;
  window.addEventListener('error', e => remember(`Error: ${e.message || e.error?.message || 'desconocido'}${e.filename ? ` (${e.filename.split('/').pop()}:${e.lineno})` : ''}`));
  window.addEventListener('unhandledrejection', e => remember(`Promesa: ${(e.reason && (e.reason.message || String(e.reason))) || 'desconocido'}`));
}

export const getRecentErrors = () => [...recentErrors];

// Versión exacta publicada: en la web, el nombre del archivo principal cambia en cada publicación
const buildId = () => {
  if (Platform.OS !== 'web' || typeof document === 'undefined') return '';
  const src = Array.from(document.scripts).map(s => s.src).find(s => /\/entry-[a-f0-9]+\.js/.test(s)) || '';
  return (src.match(/entry-([a-f0-9]{8})/) || [])[1] || '';
};

export async function collectDiagnostics(): Promise<Record<string, any>> {
  const win = Dimensions.get('window');
  const web = Platform.OS === 'web' && typeof window !== 'undefined';
  let pending = 0;
  try { pending = await syncManager.getPendingCount(); } catch {}
  const version = Constants.expoConfig?.version || '';
  const d: Record<string, any> = {
    'Versión de la app': [version, buildId()].filter(Boolean).join(' · ') || 'desconocida',
    'Dispositivo': web ? deviceName() : `${Platform.OS} ${Platform.Version}`,
    'App instalada': web ? (isStandalone() ? 'sí (pantalla de inicio)' : 'no (navegador)') : 'app nativa',
    'Pantalla': `${Math.round(win.width)}×${Math.round(win.height)}${web ? ` @${window.devicePixelRatio || 1}x` : ''}`,
    'Conexión': web ? (navigator.onLine ? 'con internet' : 'sin internet') : 'desconocida',
    'Cambios sin subir': pending,
    'Notificaciones': web ? String(permissionState()) : 'n/a',
    'Idioma y zona': `${web ? navigator.language : ''} · ${Intl.DateTimeFormat().resolvedOptions().timeZone || ''}`,
    'Hora del dispositivo': new Date().toLocaleString('es-ES'),
    'Servidor': BACKEND_URL,
  };
  if (web) d['Navegador (completo)'] = navigator.userAgent;
  const errors = getRecentErrors();
  d['Errores recientes'] = errors.length ? errors : ['ninguno'];
  return d;
}
