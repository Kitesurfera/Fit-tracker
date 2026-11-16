import { Platform } from 'react-native';

// Vídeos de técnica en Cloudinary (la "nube" donde se guardan los archivos).
//
// Compatibilidad: los iPhone graban en .MOV con el códec HEVC, que muchos navegadores de ordenador
// (Chrome, Firefox) no saben reproducir. Por eso nunca reproducimos el archivo original: pedimos a
// Cloudinary una versión MP4 H.264 de 720p, que funciona en cualquier móvil y ordenador.

export const CLOUD_NAME = 'slsdfq8t';
const UPLOAD_PRESET = 'fit_tracker_videos';
export const MAX_VIDEO_MB = 100; // límite por vídeo del plan gratuito de Cloudinary
const PLAY_TRANSFORM = 'vc_h264,ac_aac,q_auto,w_720,c_limit';
const POSTER_TRANSFORM = 'so_0,w_720,c_limit,q_auto';

export type UploadedVideo = { url: string; publicId: string; duration?: number; bytes?: number };

// Solo transformamos las direcciones originales de nuestra nube (…/video/upload/v123/…)
const splitCloudinaryUrl = (url: string) => {
  const m = (url || '').match(/^(https:\/\/res\.cloudinary\.com\/[^/]+\/video\/upload\/)(v\d+\/.+)$/);
  return m ? { base: m[1], rest: m[2].split('?')[0] } : null;
};

// Versión que se reproduce en todos los dispositivos (MP4 H.264 + AAC, máximo 720 px de ancho)
export function playableVideoUrl(url: string): string {
  const parts = splitCloudinaryUrl(url);
  if (!parts) return url;
  return `${parts.base}${PLAY_TRANSFORM}/${parts.rest.replace(/\.[A-Za-z0-9]+$/, '')}.mp4`;
}

// Imagen del primer fotograma, para mostrar antes de darle a reproducir
export function videoPosterUrl(url: string): string | undefined {
  const parts = splitCloudinaryUrl(url);
  if (!parts) return undefined;
  return `${parts.base}${POSTER_TRANSFORM}/${parts.rest.replace(/\.[A-Za-z0-9]+$/, '')}.jpg`;
}

// Pide la versión compatible en cuanto se sube, para que esté lista cuando el entrenador la abra
export function prepareVideoForPlayback(url: string) {
  if (Platform.OS !== 'web' || typeof document === 'undefined') return;
  try {
    const v = document.createElement('video');
    v.preload = 'metadata';
    v.muted = true;
    v.src = playableVideoUrl(url);
    const done = () => { v.removeAttribute('src'); v.load(); };
    v.addEventListener('loadedmetadata', done, { once: true });
    setTimeout(done, 30000);
  } catch {}
}

const friendlyError = (message: string) => {
  if (/too large|file size/i.test(message)) return `El vídeo pesa demasiado (máximo ${MAX_VIDEO_MB} MB). Graba un clip más corto, de unos 30 segundos.`;
  if (/unsupported|invalid/i.test(message)) return 'Ese archivo no es un vídeo compatible. Prueba con otro.';
  if (/preset/i.test(message)) return 'La subida de vídeos no está bien configurada en la nube (Cloudinary).';
  return message || 'No se pudo subir el vídeo.';
};

export const formatMB = (bytes: number) => `${(bytes / (1024 * 1024)).toFixed(bytes > 10 * 1024 * 1024 ? 0 : 1)} MB`;

// Sube el vídeo (web) mostrando el progreso. onProgress recibe un número de 0 a 1.
export function uploadVideoFile(file: Blob, fileName: string, onProgress?: (fraction: number) => void): Promise<UploadedVideo> {
  if (file.size > MAX_VIDEO_MB * 1024 * 1024) {
    return Promise.reject(new Error(`El vídeo pesa ${formatMB(file.size)} y el máximo es ${MAX_VIDEO_MB} MB. Graba un clip más corto (unos 30 segundos) o recórtalo antes de subirlo.`));
  }
  return new Promise((resolve, reject) => {
    const form = new FormData();
    form.append('file', file, fileName || 'video.mp4');
    form.append('upload_preset', UPLOAD_PRESET);
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `https://api.cloudinary.com/v1_1/${CLOUD_NAME}/video/upload`);
    xhr.timeout = 15 * 60 * 1000;
    xhr.upload.onprogress = (e) => { if (e.lengthComputable && onProgress) onProgress(e.loaded / e.total); };
    xhr.onload = () => {
      let data: any = {};
      try { data = JSON.parse(xhr.responseText); } catch {}
      if (xhr.status >= 200 && xhr.status < 300 && data.secure_url) {
        resolve({ url: data.secure_url, publicId: data.public_id, duration: data.duration, bytes: data.bytes });
      } else {
        reject(new Error(friendlyError(data?.error?.message || `Error ${xhr.status}`)));
      }
    };
    xhr.onerror = () => reject(new Error('Sin conexión con la nube. Comprueba tu internet y vuelve a intentarlo.'));
    xhr.ontimeout = () => reject(new Error('La subida ha tardado demasiado. Prueba con un vídeo más corto o con mejor conexión.'));
    xhr.send(form);
  });
}

// Versión para la app nativa (sin barra de progreso)
export async function uploadVideoNative(uri: string): Promise<UploadedVideo> {
  const name = uri.split('/').pop() || 'video.mp4';
  const ext = (/\.(\w+)$/.exec(name)?.[1] || 'mp4').toLowerCase();
  const form = new FormData();
  form.append('file', { uri, name, type: ext === 'mov' ? 'video/quicktime' : `video/${ext}` } as any);
  form.append('upload_preset', UPLOAD_PRESET);
  const res = await fetch(`https://api.cloudinary.com/v1_1/${CLOUD_NAME}/video/upload`, { method: 'POST', body: form });
  const data = await res.json().catch(() => ({}));
  if (!data.secure_url) throw new Error(friendlyError(data?.error?.message || ''));
  return { url: data.secure_url, publicId: data.public_id, duration: data.duration, bytes: data.bytes };
}

// Web: abre el selector de archivos. capture = abre directamente la cámara en el móvil.
export function pickVideoFileWeb(capture: boolean): Promise<File | null> {
  return new Promise((resolve) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'video/*';
    if (capture) input.setAttribute('capture', 'environment');
    input.style.display = 'none';
    input.onchange = () => { resolve(input.files?.[0] || null); input.remove(); };
    // Si se cierra el selector sin elegir, algunos navegadores no avisan: no pasa nada, la promesa queda sin resolver
    document.body.appendChild(input);
    input.click();
  });
}

export const isTouchDevice = () =>
  Platform.OS !== 'web' || (typeof window !== 'undefined' && (window.matchMedia?.('(pointer: coarse)').matches || (navigator as any).maxTouchPoints > 0));

export const formatSeconds = (s: number) => {
  const total = Math.max(0, Math.round(s));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
};
