// Inicio de sesión con Google "por redirección" (versión web).
// En vez de abrir una ventana emergente —que Firefox, algunos bloqueadores y la app instalada en el iPhone
// a veces bloquean o rompen— vamos a la página de Google y Google nos devuelve a la app con la cuenta elegida.
// Google devuelve un "ID token" en la dirección (después de #), que el servidor comprueba en /api/auth/google.

const PENDING_KEY = 'google_redirect_pending';
const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
const MAX_AGE_MS = 15 * 60 * 1000;

export type GoogleMode = 'login' | 'register';
export type GoogleRedirectResult = { idToken: string; mode: GoogleMode } | { error: string } | null;

const RESULT_KEY = 'google_redirect_result';
let consumed = false;

const randomString = () => {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
};

// Dirección a la que Google devuelve a la persona: una pequeña página (public/google-callback.html) que guarda
// la respuesta y vuelve a la app con la dirección limpia. Tiene que estar autorizada en Google Cloud
// (Credenciales → cliente web → "URI de redirección autorizados").
export const googleRedirectUri = () => `${window.location.origin}/google-callback`;

export function startGoogleRedirect(clientId: string, mode: GoogleMode) {
  const state = randomString();
  const nonce = randomString();
  try { localStorage.setItem(PENDING_KEY, JSON.stringify({ state, nonce, mode, ts: Date.now() })); } catch {}
  const params = new URLSearchParams({
    client_id: clientId,
    redirect_uri: googleRedirectUri(),
    response_type: 'id_token',
    scope: 'openid email profile',
    nonce,
    state,
    prompt: 'select_account',
  });
  window.location.assign(`${GOOGLE_AUTH_URL}?${params.toString()}`);
}

const jwtPayload = (token: string): any => {
  try {
    const part = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    return JSON.parse(atob(part + '='.repeat((4 - (part.length % 4)) % 4)));
  } catch {
    return null;
  }
};

// Al volver de Google: lee la respuesta que dejó google-callback.html (una sola vez) y la comprueba.
export function consumeGoogleRedirect(): GoogleRedirectResult {
  if (consumed || typeof window === 'undefined') return null;
  let saved: any = null;
  try {
    saved = JSON.parse(localStorage.getItem(RESULT_KEY) || 'null');
    localStorage.removeItem(RESULT_KEY);
  } catch {}
  if (!saved?.hash || Date.now() - (saved.ts || 0) > MAX_AGE_MS) return null;
  consumed = true;
  const params = new URLSearchParams(saved.hash);

  let pending: any = null;
  try {
    pending = JSON.parse(localStorage.getItem(PENDING_KEY) || 'null');
    localStorage.removeItem(PENDING_KEY);
  } catch {}

  // "state" comprueba que la respuesta es de un inicio de sesión que empezamos nosotros
  if (!pending || pending.state !== params.get('state') || Date.now() - pending.ts > MAX_AGE_MS) {
    return { error: 'El inicio de sesión con Google ha caducado. Vuelve a pulsar el botón.' };
  }
  const err = params.get('error');
  if (err) {
    return { error: err === 'access_denied' ? 'Has cancelado el inicio de sesión con Google.' : 'Google no ha podido completar el inicio de sesión. Inténtalo otra vez.' };
  }
  const idToken = params.get('id_token') || '';
  // "nonce" comprueba que el token es para este intento y no uno reutilizado
  if (jwtPayload(idToken)?.nonce !== pending.nonce) {
    return { error: 'No se ha podido comprobar la respuesta de Google. Inténtalo otra vez.' };
  }
  return { idToken, mode: pending.mode === 'register' ? 'register' : 'login' };
}
