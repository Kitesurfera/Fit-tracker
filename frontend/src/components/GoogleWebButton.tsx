import React, { useEffect, useRef } from 'react';
import { View } from 'react-native';

// Botón oficial "Continuar con Google" (Google Identity Services) para la versión web.
// Lo mantiene Google y funciona igual en Chrome, Safari y Firefox; devuelve directamente el ID token
// que valida el backend en /api/auth/google.

const GIS_SRC = 'https://accounts.google.com/gsi/client?hl=es';
let gisLoading: Promise<void> | null = null;

function loadGoogleIdentity(): Promise<void> {
  const w = window as any;
  if (w.google?.accounts?.id) return Promise.resolve();
  if (!gisLoading) {
    gisLoading = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = GIS_SRC;
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => { gisLoading = null; reject(new Error('gis-load-failed')); };
      document.head.appendChild(script);
    });
  }
  return gisLoading;
}

type Props = {
  clientId: string;
  onCredential: (idToken: string) => void;
  onError: (message: string) => void;
  dark?: boolean;
  disabled?: boolean;
};

export default function GoogleWebButton({ clientId, onCredential, onError, dark, disabled }: Props) {
  const containerRef = useRef<any>(null);
  // Guardamos los callbacks en refs para no volver a dibujar el botón en cada render
  const onCredentialRef = useRef(onCredential);
  const onErrorRef = useRef(onError);
  onCredentialRef.current = onCredential;
  onErrorRef.current = onError;

  useEffect(() => {
    let cancelled = false;
    loadGoogleIdentity()
      .then(() => {
        const container = containerRef.current as HTMLElement | null;
        if (cancelled || !container) return;
        const google = (window as any).google;
        google.accounts.id.initialize({
          client_id: clientId,
          ux_mode: 'popup',
          callback: (res: any) => {
            if (res?.credential) onCredentialRef.current(res.credential);
            else onErrorRef.current('Google no devolvió la cuenta. Inténtalo de nuevo.');
          },
        });
        container.innerHTML = '';
        google.accounts.id.renderButton(container, {
          type: 'standard',
          theme: dark ? 'filled_black' : 'outline',
          size: 'large',
          text: 'continue_with',
          shape: 'pill',
          locale: 'es',
          width: Math.max(200, Math.min(container.offsetWidth || 320, 400)),
        });
      })
      .catch(() => {
        if (!cancelled) {
          onErrorRef.current('No se pudo cargar el inicio de sesión de Google. Revisa la conexión o desactiva el bloqueador de contenido para esta web.');
        }
      });
    return () => { cancelled = true; };
  }, [clientId, dark]);

  return (
    <View
      ref={containerRef}
      accessibilityLabel="Continuar con Google"
      pointerEvents={disabled ? 'none' : 'auto'}
      style={{ width: '100%', minHeight: 44, alignItems: 'center', justifyContent: 'center', opacity: disabled ? 0.5 : 1 }}
    />
  );
}
