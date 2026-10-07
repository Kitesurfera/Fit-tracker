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
        {/* "default": la app empieza justo debajo de la hora y la batería. Con "black-translucent" iOS dibujaba
            la app por debajo de la barra de estado y calculaba mal su altura (quedaba un hueco abajo). */}
        <meta name="apple-mobile-web-app-status-bar-style" content="default" />
        
        {/* Ruta al icono para la pantalla de inicio */}
        <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />

        {/* --- PWA: ficha de la app (icono, nombre, colores) --- */}
        <link rel="manifest" href="/manifest.json" />
        {/* Color de la barra de estado: el mismo fondo que la app, en modo claro y oscuro */}
        <meta name="theme-color" content="#f8fafc" media="(prefers-color-scheme: light)" />
        <meta name="theme-color" content="#0f172a" media="(prefers-color-scheme: dark)" />

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
