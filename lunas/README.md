# Lunas 🌙🌙

App web para que **dos personas compartan el seguimiento de su ciclo menstrual**. Cada una apunta su regla y cómo se siente, y ve el ciclo de la otra: cuándo le toca la regla, en qué fase está, si estáis sincronizadas… y le puede mandar un mensajito de cariño.

- Inicio de sesión con **Google** (sin contraseñas).
- **Invitación por enlace o código**: solo os conectáis si las dos queréis, y podéis desconectaros cuando sea.
- **Predicciones** de la próxima regla, fase del ciclo, ventana fértil y ovulación estimadas (con la media de tus últimos ciclos).
- **Calendario** con tu ciclo, el suyo o los dos a la vez.
- **Registro diario**: flujo, síntomas, ánimo y notas.
- **Privacidad**: tú eliges si ella ve tus síntomas, tus notas y tus días fértiles. Puedes descargar tus datos o borrar tu cuenta.
- Se puede **instalar en el móvil** como una app (PWA) y tiene modo oscuro.

> Las predicciones son estimaciones (método del calendario). No son un método anticonceptivo ni sustituyen el consejo de una profesional sanitaria.

## Tecnología

| Parte | Qué se usa |
| --- | --- |
| Web | [Next.js 16](https://nextjs.org) (App Router, Server Actions) + React 19 + TypeScript |
| Inicio de sesión | [Auth.js](https://authjs.dev) (next-auth v5) con Google |
| Base de datos | MongoDB (gratis con [MongoDB Atlas](https://www.mongodb.com/atlas)) |
| Despliegue | [Vercel](https://vercel.com) (gratis), o Docker en cualquier otro sitio |

Todo cabe en los planes gratuitos de Atlas, Google Cloud y Vercel.

---

## Despliegue paso a paso (unos 15 minutos)

Necesitas tres cosas: una base de datos, unas credenciales de Google y un sitio donde publicar la web.

### 1. Base de datos: MongoDB Atlas

1. Crea una cuenta en <https://www.mongodb.com/cloud/atlas/register> y crea un clúster **gratuito (M0)**.
2. En **Database Access**, crea un usuario con contraseña (rol *Read and write to any database*).
3. En **Network Access**, añade la IP `0.0.0.0/0` (*Allow access from anywhere*). Vercel no tiene IPs fijas, así que hace falta.
4. En **Connect → Drivers**, copia la cadena de conexión. Se parece a:
   `mongodb+srv://usuario:contraseña@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority`
   Sustituye `<password>` por la contraseña del usuario. Esa cadena es tu `MONGODB_URI`.

> Atajo: en Vercel puedes añadir la integración de MongoDB Atlas desde el *Marketplace*, que crea la base de datos y la variable `MONGODB_URI` por ti.

No hace falta crear colecciones ni índices: la app los crea sola la primera vez.

### 2. Inicio de sesión con Google

1. Entra en <https://console.cloud.google.com/> y crea un proyecto nuevo (por ejemplo, «Lunas»).
2. Ve a **Google Auth Platform** (o *APIs y servicios → Pantalla de consentimiento de OAuth*):
   - **Marca / Branding**: nombre de la app «Lunas», tu correo de asistencia y, cuando tengas la URL, la página de inicio y la de privacidad (`https://TU-DOMINIO/privacidad`).
   - **Público / Audience**: tipo **Externo**. Pulsa **Publicar app** para que pueda entrar cualquier cuenta de Google. Mientras esté en «Prueba», solo podrán entrar los correos que añadas como usuarios de prueba. Como la app solo pide nombre, correo y foto, Google no exige verificación.
3. Ve a **Clientes → Crear cliente**:
   - Tipo: **Aplicación web**.
   - **Orígenes de JavaScript autorizados**: `http://localhost:3000` (y más tarde tu dominio de Vercel).
   - **URIs de redireccionamiento autorizados**: `http://localhost:3000/api/auth/callback/google` (y más tarde `https://TU-DOMINIO/api/auth/callback/google`).
4. Copia el **ID de cliente** (`AUTH_GOOGLE_ID`) y el **secreto de cliente** (`AUTH_GOOGLE_SECRET`).

### 3. Publicar en Vercel

1. Entra en <https://vercel.com/new> con tu cuenta de GitHub e importa este repositorio.
2. En **Root Directory**, pulsa *Edit* y elige la carpeta **`lunas`**. Esto es importante porque el repositorio tiene otras apps.
3. Vercel detecta Next.js solo. En **Environment Variables**, añade:

   | Variable | Valor |
   | --- | --- |
   | `AUTH_SECRET` | Un texto aleatorio largo. Genéralo con `npx auth secret` o `openssl rand -base64 32` |
   | `AUTH_GOOGLE_ID` | El ID de cliente de Google |
   | `AUTH_GOOGLE_SECRET` | El secreto de cliente de Google |
   | `MONGODB_URI` | La cadena de conexión de Atlas |
   | `MONGODB_DB` | `lunas` (opcional) |

4. Pulsa **Deploy**. Al terminar tendrás una URL tipo `https://lunas-tuusuario.vercel.app`.

### 4. Avisar a Google de tu dominio

Vuelve a tu cliente OAuth en Google Cloud y añade:

- En **Orígenes de JavaScript autorizados**: `https://lunas-tuusuario.vercel.app`
- En **URIs de redireccionamiento autorizados**: `https://lunas-tuusuario.vercel.app/api/auth/callback/google`

Guarda los cambios (a veces Google tarda unos minutos en aplicarlos) y ya está: abre la web, entra con Google e invita a tu compañera desde **Compañera → Crear enlace de invitación**.

Si más adelante pones un dominio propio, añádelo también en Google. Cada vez que hagas *push* a la rama principal, Vercel vuelve a publicar la app. En las *previews* de Vercel (las URLs temporales de cada rama) el login de Google no funcionará, salvo que añadas también esas URLs en Google.

### 5. Instalarla en el móvil

- **iPhone (Safari)**: botón Compartir → *Añadir a pantalla de inicio*.
- **Android (Chrome)**: menú ⋮ → *Instalar app* / *Añadir a pantalla de inicio*.

---

## Variables de entorno

| Variable | Obligatoria | Para qué |
| --- | --- | --- |
| `AUTH_SECRET` | Sí | Cifra la cookie de sesión |
| `AUTH_GOOGLE_ID` | Sí | ID del cliente OAuth de Google |
| `AUTH_GOOGLE_SECRET` | Sí | Secreto del cliente OAuth de Google |
| `MONGODB_URI` | Sí | Conexión a MongoDB |
| `MONGODB_DB` | No | Nombre de la base de datos (por defecto `lunas`) |
| `AUTH_URL` | Solo fuera de Vercel | URL pública, por ejemplo `https://lunas.midominio.com` |
| `AUTH_TRUST_HOST` | Solo fuera de Vercel | Ponla a `true` detrás de un proxy (Render, Railway, Docker…) |

Tienes una plantilla en [`.env.example`](.env.example).

## Desarrollo en local

Necesitas Node.js 22.18 o superior.

```bash
cd lunas
cp .env.example .env.local   # y rellena los valores
npm install
npm run dev                  # http://localhost:3000
```

Otros comandos:

```bash
npm test           # tests de los cálculos del ciclo
npm run typecheck  # comprobación de tipos
npm run build      # build de producción
```

GitHub Actions ejecuta tests, tipos y build en cada cambio de la carpeta `lunas/` (`.github/workflows/lunas.yml`).

## Otras plataformas (Docker)

Hay un `Dockerfile` listo para Render, Railway, Fly.io, Google Cloud Run o un servidor propio:

```bash
docker build -t lunas .
docker run -p 3000:3000 --env-file .env.local -e AUTH_URL=https://tu-dominio lunas
```

En **Render**: *New → Web Service*, elige el repositorio, *Root Directory* `lunas`, entorno *Docker*, y añade las variables de entorno (incluida `AUTH_URL` con la URL que te dé Render).

## Estructura del proyecto

```
lunas/
├── src/
│   ├── auth.ts                  # Login con Google (Auth.js) y alta de usuarias en MongoDB
│   ├── app/
│   │   ├── page.tsx             # Portada con el botón de Google
│   │   ├── (app)/inicio         # Hoy: tu ciclo, el de tu compañera y los cariños
│   │   ├── (app)/calendario     # Calendario (tú / ella / las dos) e historial de reglas
│   │   ├── (app)/registro       # Registro de un día: regla, flujo, síntomas, ánimo, nota
│   │   ├── (app)/companera      # Invitar, aceptar, ver su ciclo, desconectar
│   │   ├── (app)/ajustes        # Duraciones, privacidad, exportar y borrar cuenta
│   │   ├── invitacion/[code]    # Página del enlace de invitación
│   │   ├── privacidad           # Política de privacidad
│   │   └── api/                 # Auth.js y descarga de datos
│   ├── components/              # Anillo del ciclo, calendario, formularios…
│   └── lib/
│       ├── cycle.ts             # Cálculos del ciclo (con tests en cycle.test.ts)
│       ├── dates.ts             # Fechas como "AAAA-MM-DD", sin líos de zonas horarias
│       ├── data.ts              # Qué ve cada una (aplica la privacidad)
│       ├── actions.ts           # Server Actions (todas comprueban la sesión)
│       └── db.ts                # Conexión e índices de MongoDB
├── public/icons/                # Iconos de la app
├── Dockerfile
└── .env.example
```

## Privacidad y seguridad

- Cada acción del servidor comprueba la sesión y solo toca datos de la usuaria que la hace.
- Para ver los datos de otra persona tiene que existir una **conexión mutua**: una crea la invitación y la otra la acepta. Los códigos caducan a los 7 días y sirven una sola vez.
- Lo que ve la compañera pasa siempre por `src/lib/data.ts`, que aplica sus ajustes: por defecto comparte reglas, síntomas y ánimo, pero **no** las notas ni los días fértiles.
- Los mensajitos de cariño se borran solos a los 30 días.
- Desde Ajustes cada una puede descargar sus datos en JSON y borrar su cuenta (se borra todo de inmediato).

## Ideas para más adelante

- Avisos (notificaciones push) unos días antes de la regla.
- Recordatorio para apuntar cómo te sientes.
- Gráficas de síntomas por fase del ciclo.
