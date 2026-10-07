// @ts-nocheck
import { ScrollViewStyleReset } from "expo-router/html";
import type { PropsWithChildren } from "react";

export default function Root({ children }: PropsWithChildren) {
  return (
    <html lang="es" style={{ height: "100%" }}>
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        
        {/* Viewport optimizado para iPhone (notch y safe areas) */}
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, shrink-to-fit=no, viewport-fit=cover"
        />

        {/* --- CONFIGURACIÓN PARA SAFARI (iOS) --- */}
        <title>AM Coaching</title>
        <meta name="apple-mobile-web-app-title" content="AM Coaching" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        
        {/* Ruta al icono para la pantalla de inicio */}
        <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />

        {/* --- PWA: ficha de la app (icono, nombre, colores) --- */}
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#4A90E2" />

        {/* iPhone con la app en la pantalla de inicio: con la barra de estado transparente, iOS calcula la
            altura como si la barra ocupara sitio y deja un hueco abajo. Ajustamos la app al alto real de la
            pantalla. Si iOS no tiene el fallo, las dos alturas coinciden y no se cambia nada. */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              (function () {
                if (window.navigator.standalone !== true) return;
                function fit() {
                  var root = document.getElementById('root');
                  if (!root) return;
                  var portrait = window.innerHeight > window.innerWidth;
                  var full = portrait ? Math.max(window.innerHeight, window.screen.height) : window.innerHeight;
                  if (full > window.innerHeight) {
                    root.style.setProperty('bottom', 'auto', 'important');
                    root.style.setProperty('height', full + 'px', 'important');
                  } else {
                    root.style.removeProperty('bottom');
                    root.style.removeProperty('height');
                  }
                }
                document.addEventListener('DOMContentLoaded', fit);
                window.addEventListener('resize', fit);
                window.addEventListener('orientationchange', function () { setTimeout(fit, 300); });
              })();
            `,
          }}
        />

        <ScrollViewStyleReset />
        <style
          dangerouslySetInnerHTML={{
            __html: `
              body > div:first-child { position: fixed !important; top: 0; left: 0; right: 0; bottom: 0; }
              html, body { background-color: #ffffff; }
              @media (prefers-color-scheme: dark) { html, body { background-color: #1e293b; } }
              [role="tablist"] [role="tab"] * { overflow: visible !important; }
              [role="heading"], [role="heading"] * { overflow: visible !important; }
            `,
          }}
        />
      </head>
      <body
        style={{
          margin: 0,
          height: "100%",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
        }}
      >
        {children}
      </body>
    </html>
  );
}
