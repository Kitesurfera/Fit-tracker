# Pasar el servidor de Render a Vercel

Hoy la app está en dos sitios:

- **La web** (lo que ves en el navegador) → Vercel.
- **El servidor** (`backend/`, guarda los datos y habla con la IA) → Render. En el plan gratuito se duerme tras 15 minutos sin uso y tarda ~1 minuto en despertar.

Vamos a crear un **segundo proyecto en Vercel** para el servidor. Render sigue funcionando hasta el último paso, así que la app no deja de funcionar en ningún momento y siempre puedes volver atrás.

---

## Paso 1 · Crear el proyecto del servidor en Vercel

1. Entra en [vercel.com](https://vercel.com) → **Add New… → Project**.
2. Elige el repositorio **Fit-tracker** (el mismo de la web) → **Import**.
3. En **Root Directory** pulsa **Edit** y elige la carpeta **`backend`**.
4. En **Framework Preset** debería salir **FastAPI** (si no, elige *Other*).
5. Ponle un nombre fácil, por ejemplo `amcoaching-api`.
6. Abre **Environment Variables** y copia **todas** las variables que tienes en Render
   (Render → tu servicio → **Environment**), con el mismo nombre y valor. Las importantes:

   | Variable | Para qué sirve |
   |---|---|
   | `MONGO_URL` | Conexión con la base de datos |
   | `DB_NAME` | Nombre de la base de datos |
   | `JWT_SECRET` | Las sesiones iniciadas (si cambia, todos tendréis que volver a entrar) |
   | `GEMINI_API_KEY` | La IA |
   | `TRAINER_SIGNUP_EMAILS` | Quién puede registrarse como entrenador |
   | `SMTP_USER`, `SMTP_PASSWORD` (y `SMTP_SERVER`, `SMTP_PORT` si los tienes) | Envío de emails |
   | `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | Notificaciones |
   | `GOOGLE_...` (si tienes alguna) | Inicio de sesión con Google |

   No copies `PORT` ni `PYTHON_VERSION` (en Vercel no hacen falta).
   Truco: en Vercel puedes pegar varias variables a la vez en formato `NOMBRE=valor`, una por línea.
7. Pulsa **Deploy** y espera a que termine.

## Paso 2 · Ajustes que hacen que vaya rápido

1. **Región:** en Vercel → proyecto `amcoaching-api` → **Settings → Functions → Function Region**, elige la región más cercana a tu base de datos. La ves en MongoDB Atlas, en el nombre de tu clúster:

   | Región en Atlas | Región en Vercel |
   |---|---|
   | Frankfurt (eu-central-1) | Frankfurt, Germany (`fra1`) |
   | Ireland (eu-west-1) | Dublin, Ireland (`dub1`) |
   | Paris (eu-west-3) | Paris, France (`cdg1`) |
   | London (eu-west-2) | London, England (`lhr1`) |
   | N. Virginia (us-east-1) | Washington, D.C. (`iad1`) |

   Después ve a **Deployments**, abre el menú `⋯` del último y pulsa **Redeploy** para aplicarlo.
2. **MongoDB Atlas:** Vercel no tiene una dirección IP fija. En Atlas → **Network Access** debe estar permitido `0.0.0.0/0` (*Allow access from anywhere*). Si Render ya funcionaba, casi seguro que ya está.

## Paso 3 · Comprobar que el servidor nuevo funciona

Abre en el navegador `https://amcoaching-api.vercel.app/ping` (con el nombre que hayas puesto).
Debe aparecer: `{"status":"awake","message":"El servidor está activo."}`

Si sale un error, mira **Deployments → (el último) → Logs** en Vercel y mándame una captura.

## Paso 4 · Conectar la web al servidor nuevo

1. En Vercel, abre el proyecto **de la web** (el que ya tenías).
2. **Settings → Environment Variables** → busca `EXPO_PUBLIC_BACKEND_URL`.
   - Si existe, pulsa **Edit**. Si no, créala.
   - Valor: `https://amcoaching-api.vercel.app` (tu dirección, **sin** barra al final).
   - Marca al menos el entorno **Production**.
3. Ve a **Deployments** → `⋯` del último → **Redeploy** (la dirección se "graba" en la web al publicarla, por eso hay que volver a publicar).
4. Cierra la app del todo y ábrela de nuevo. Prueba: entrar, ver una sesión, crear otra y usar la IA.

## Paso 5 · Apagar Render (cuando lleve unos días funcionando bien)

Render → tu servicio → **Settings → Suspend Web Service**. No lo borres todavía: así puedes volver atrás.

---

## ¿Algo va mal? Volver a Render

1. Si suspendiste Render, reactívalo (**Resume**).
2. En el proyecto de la web en Vercel, cambia `EXPO_PUBLIC_BACKEND_URL` a `https://fit-tracker-backend-rtx2.onrender.com` (o bórrala).
3. **Redeploy**. En un par de minutos la app vuelve a usar Render.

## Notas

- **Plan gratuito de Vercel (Hobby):** es para uso personal y no comercial. Si algún día cobráis a las atletas, hay que pasar al plan Pro.
- Los límites de tiempo de la IA se pueden ajustar sin tocar código con las variables `GEMINI_MODELS`, `GEMINI_TIMEOUT_SECONDS` y `GEMINI_TOTAL_BUDGET_SECONDS`.
