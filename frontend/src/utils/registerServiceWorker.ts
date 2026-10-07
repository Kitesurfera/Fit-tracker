import { Platform } from 'react-native';

// Activa el service worker (public/sw.js) en la versión web publicada, no mientras se desarrolla.
export function registerServiceWorker() {
  if (Platform.OS !== 'web' || __DEV__ || typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;

  navigator.serviceWorker
    .register('/sw.js')
    .then(() => navigator.serviceWorker.ready)
    .then((registration) => {
      // Le pasamos lo que la página ya descargó (fuentes, imágenes) para que también lo guarde
      const urls = performance.getEntriesByType('resource')
        .map((entry) => entry.name)
        .filter((url) => url.startsWith(window.location.origin));
      registration.active?.postMessage({ type: 'CACHE_URLS', urls });
    })
    .catch((e) => console.log('No se pudo activar el modo app (service worker):', e));
}
