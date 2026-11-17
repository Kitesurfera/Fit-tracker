// Pitidos del temporizador en la versión web (Chrome, Safari y la app instalada como PWA).
//
// Qué tiene que pasar: los pitidos suenan POR ENCIMA de la música que estés escuchando (Spotify, Apple Music…)
// sin pararla, en iPhone y en Android.
//
//  - iPhone: el navegador decide si el sonido de una web se mezcla con la música según el "modo de audio"
//    (navigator.audioSession.type). En modo "ambient" se mezcla; en modo "playback" la música se PARA.
//    Por eso usamos "ambient". Su única pega: si el interruptor de silencio del iPhone está activado, no suena.
//    Quien lo prefiera puede activar "Sonar con el iPhone en silencio" en Ajustes (entonces sí se pausa la música).
//  - Android: Chrome pausa la música de otras apps cuando una web reproduce sonido con un <audio>, pero no con
//    el motor Web Audio. Por eso los pitidos se generan siempre con Web Audio y nunca con archivos de audio.
//  - Los navegadores no dejan sonar nada hasta que la persona toca la pantalla, y al volver de otra app el audio
//    puede quedar "interrumpido". Por eso en CADA toque despertamos el audio y reproducimos un sonido mudo.

let ctx: AudioContext | null = null;
let listenersInstalled = false;
let soundInSilentMode = false;
let lastLongBeepAt = 0;

const isWeb = () => typeof window !== 'undefined' && typeof document !== 'undefined';

// Clave nueva: antes el valor por defecto paraba la música, así que empezamos todos desde "mezclar con la música"
export const SILENT_MODE_KEY = 'timer_sounds_silent_mode_v2';

const applyAudioSession = () => {
  try {
    // Safari 16.4+/iOS 17+. En otros navegadores no existe y no pasa nada.
    const session = (navigator as any).audioSession;
    if (!session) return;
    const wanted = soundInSilentMode ? 'playback' : 'ambient';
    if (session.type !== wanted) session.type = wanted;
  } catch {}
};

// Lo antes posible: el modo de audio tiene que estar puesto antes de que suene nada
if (isWeb()) applyAudioSession();

// true: suena aunque el iPhone esté en silencio, pero pausa la música. false (recomendado): se mezcla con la música.
export const setSoundInSilentMode = (value: boolean) => {
  soundInSilentMode = value;
  applyAudioSession();
};

const getCtx = (): AudioContext | null => {
  if (!isWeb()) return null;
  const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
  if (!AudioContextClass) return null;
  if (!ctx || ctx.state === 'closed') {
    applyAudioSession();
    try { ctx = new AudioContextClass(); } catch { return null; }
  }
  return ctx;
};

const wake = (c: AudioContext) => {
  // 'suspended' (aún no desbloqueado) o 'interrupted' (Safari tras segundo plano o una llamada)
  if (c.state !== 'running') c.resume().catch(() => {});
};

// Llamar dentro de un toque o clic: crea/despierta el audio y lo deja desbloqueado.
export const unlockWebAudio = () => {
  const c = getCtx();
  if (!c) return;
  applyAudioSession();
  wake(c);
  try {
    const buffer = c.createBuffer(1, 1, 22050);
    const source = c.createBufferSource();
    source.buffer = buffer;
    source.connect(c.destination);
    source.start(0);
  } catch {}
};

// Escucha todos los toques de la pantalla mientras dure el entrenamiento. Devuelve una función para dejar de escuchar.
export const installWebAudioUnlock = () => {
  if (!isWeb() || listenersInstalled) return () => {};
  listenersInstalled = true;
  const events = ['pointerdown', 'touchend', 'click', 'keydown'];
  const handler = () => unlockWebAudio();
  const onVisible = () => { if (document.visibilityState === 'visible' && ctx) { applyAudioSession(); wake(ctx); } };
  events.forEach(e => document.addEventListener(e, handler, { capture: true, passive: true }));
  document.addEventListener('visibilitychange', onVisible);
  window.addEventListener('pageshow', onVisible);
  return () => {
    events.forEach(e => document.removeEventListener(e, handler, { capture: true } as any));
    document.removeEventListener('visibilitychange', onVisible);
    window.removeEventListener('pageshow', onVisible);
    listenersInstalled = false;
  };
};

// Un pitido: dos ondas (triangular + su octava) para que se oiga claro por encima de la música
const scheduleBeep = (c: AudioContext, freq: number, duration: number) => {
  const t0 = c.currentTime + 0.01;
  const osc1 = c.createOscillator();
  const osc2 = c.createOscillator();
  const gain = c.createGain();
  osc1.type = 'triangle';
  osc2.type = 'sine';
  osc1.frequency.setValueAtTime(freq, t0);
  osc2.frequency.setValueAtTime(freq * 2, t0);
  gain.gain.setValueAtTime(0, t0);
  gain.gain.linearRampToValueAtTime(0.85, t0 + 0.01);
  gain.gain.setValueAtTime(0.85, t0 + duration - 0.03);
  gain.gain.exponentialRampToValueAtTime(0.001, t0 + duration);
  osc1.connect(gain);
  osc2.connect(gain);
  gain.connect(c.destination);
  osc1.start(t0); osc2.start(t0);
  osc1.stop(t0 + duration + 0.02); osc2.stop(t0 + duration + 0.02);
};

export type BeepType = 'short' | 'long';

// short: cuenta atrás 3-2-1 · long: empieza o termina el tiempo de ejercicio
export const playWebBeep = (type: BeepType) => {
  // Si terminan y empiezan dos tiempos a la vez (p. ej. un lado y el otro), un solo pitido largo
  if (type === 'long') {
    const now = Date.now();
    if (now - lastLongBeepAt < 600) return;
    lastLongBeepAt = now;
  }
  // En Android, además, una vibración corta (en iPhone el navegador no deja vibrar)
  try { (navigator as any).vibrate?.(type === 'long' ? 300 : 60); } catch {}

  const c = getCtx();
  if (!c) return;
  const play = () => {
    try {
      if (type === 'short') scheduleBeep(c, 880, 0.15);
      else scheduleBeep(c, 1320, 0.6);
    } catch (e) { console.log('Error Web Audio API:', e); }
  };
  if (c.state === 'running') play();
  else c.resume().then(() => { if (c.state === 'running') play(); }).catch(() => {});
};

// Demostración (Ajustes): 3, 2, 1 y pitido largo, para comprobarlo con la música puesta
export const playCountdownDemo = () => {
  unlockWebAudio();
  [0, 1000, 2000].forEach(ms => setTimeout(() => playWebBeep('short'), ms));
  setTimeout(() => playWebBeep('long'), 3000);
};
