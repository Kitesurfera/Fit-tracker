import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Lunas · Ciclos compartidos", template: "%s · Lunas" },
  description: "Lunas: dos amigas o pareja comparten y siguen sus ciclos menstruales, con predicciones y mensajitos de cariño.",
  applicationName: "Lunas",
  appleWebApp: { capable: true, title: "Lunas", statusBarStyle: "default" },
  formatDetection: { telephone: false },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fbf7f5" },
    { media: "(prefers-color-scheme: dark)", color: "#161118" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
