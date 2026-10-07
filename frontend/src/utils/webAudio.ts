// Pitidos del temporizador en la versión web (Chrome, Safari y la app instalada como PWA).
//
// Los navegadores, sobre todo Safari en iPhone, no dejan sonar nada hasta que la persona toca la pantalla.
// Además, cuando la app pasa a segundo plano o entra una llamada, el audio queda "interrumpido" y hay que
// volver a despertarlo con otro toque. Por eso:
//  1. Creamos el motor de audio (AudioContext) siempre dentro de un toque.
//  2. En CADA toque (no solo el primero) lo despertamos si está dormido y reproducimos un sonido mudo,
//     que es lo que Safari necesita para dar el audio por desbloqueado.
//  3. Si está activado en Ajustes, pedimos al iPhone que trate los pitidos como "reproducción" para que
//     suenen aunque el interruptor de silencio esté puesto (como un vídeo). La pega: el iPhone pausa la
//     música que tengas sonando, por eso se puede desactivar.

let ctx: AudioContext | null = null;
let listenersInstalled = false;
let ignoreSilentSwitch = true;

const isWeb = () => typeof window !== 'undefined' && typeof document !== 'undefined';

export const SILENT_MODE_KEY = 'timer_sounds_silent_mode';

const setPlaybackSession = () => {
  try {
    // Safari 16.4+ (iOS 17+). En otros navegadores no existe y no pasa nada.
    const session = (navigator as any).audioSession;
    if (!session) return;
    const wanted = ignoreSilentSwitch ? 'playback' : 'auto';
    if (session.type !== wanted) session.type = wanted;
  } catch {}
};

// true: suena aunque el móvil esté en silencio (pausa la música). false: respeta el silencio y deja sonar la música.
export const setIgnoreSilentSwitch = (value: boolean) => {
  ignoreSilentSwitch = value;
  setPlaybackSession();
};

const getCtx = (): AudioContext | null => {
  if (!isWeb()) return null;
  const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
  if (!AudioContextClass) return null;
  if (!ctx || ctx.state === 'closed') {
    setPlaybackSession();
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
  setPlaybackSession();
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
  const onVisible = () => { if (document.visibilityState === 'visible' && ctx) wake(ctx); };
  events.forEach(e => document.addEventListener(e, handler, { capture: true, passive: true }));
  document.addEventListener('visibilitychange', onVisible);
  return () => {
    events.forEach(e => document.removeEventListener(e, handler, { capture: true } as any));
    document.removeEventListener('visibilitychange', onVisible);
    listenersInstalled = false;
  };
};

const scheduleBeep = (c: AudioContext, freq: number, delay: number, duration: number) => {
  const t0 = c.currentTime + delay;
  const osc1 = c.createOscillator();
  const osc2 = c.createOscillator();
  const gain = c.createGain();
  osc1.type = 'triangle';
  osc2.type = 'sine';
  osc1.frequency.setValueAtTime(freq, t0);
  osc2.frequency.setValueAtTime(freq * 2, t0);
  gain.gain.setValueAtTime(0, t0);
  gain.gain.linearRampToValueAtTime(0.75, t0 + 0.01);
  gain.gain.setValueAtTime(0.75, t0 + duration - 0.02);
  gain.gain.exponentialRampToValueAtTime(0.001, t0 + duration);
  osc1.connect(gain);
  osc2.connect(gain);
  gain.connect(c.destination);
  osc1.start(t0); osc2.start(t0);
  osc1.stop(t0 + duration); osc2.stop(t0 + duration);
};

export type BeepType = 'short' | 'long' | 'double';

// short: cuenta atrás 3-2-1 · long: empieza el trabajo · double: empieza el descanso
export const playWebBeep = (type: BeepType) => {
  const c = getCtx();
  if (!c) return;
  const play = () => {
    try {
      if (type === 'short') scheduleBeep(c, 800, 0, 0.15);
      else if (type === 'long') scheduleBeep(c, 1200, 0, 0.5);
      else { scheduleBeep(c, 400, 0, 0.15); scheduleBeep(c, 400, 0.25, 0.15); }
    } catch (e) { console.log('Error Web Audio API:', e); }
  };
  if (c.state === 'running') play();
  else c.resume().then(() => { if (c.state === 'running') play(); }).catch(() => {});
};
