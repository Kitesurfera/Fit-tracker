import type { Router } from 'expo-router';

// Vuelve a la pantalla anterior; si no la hay (se abrió la pantalla directamente, se recargó la página o
// se entró desde un enlace), va al inicio en lugar de no hacer nada.
export function goBack(router: Router, fallback: string = '/home') {
  if (router.canGoBack()) router.back();
  else router.replace(fallback as any);
}
