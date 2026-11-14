import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Lunas · Ciclos compartidos",
    short_name: "Lunas",
    description: "Seguid vuestros ciclos menstruales juntas.",
    lang: "es",
    start_url: "/inicio",
    scope: "/",
    display: "standalone",
    background_color: "#fbf7f5",
    theme_color: "#e2557a",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
