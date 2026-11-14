// Dirección del servidor (backend). Se cambia en Vercel, en el proyecto de la web:
// Settings → Environment Variables → EXPO_PUBLIC_BACKEND_URL (sin barra al final) y después "Redeploy".
// Si no está configurada, se usa el servidor de Render.
export const BACKEND_URL = (process.env.EXPO_PUBLIC_BACKEND_URL || 'https://fit-tracker-backend-rtx2.onrender.com').replace(/\/+$/, '');
