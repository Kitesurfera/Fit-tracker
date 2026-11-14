# Imagen para desplegar Lunas fuera de Vercel (Render, Railway, Fly.io, Google Cloud Run, un VPS…)
# Construir:  docker build -t lunas .
# Ejecutar:   docker run -p 3000:3000 --env-file .env.local lunas

FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-alpine AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1 BUILD_STANDALONE=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:22-alpine AS run
WORKDIR /app
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0 AUTH_TRUST_HOST=true
RUN addgroup -S lunas && adduser -S lunas -G lunas
COPY --from=build --chown=lunas:lunas /app/.next/standalone ./
COPY --from=build --chown=lunas:lunas /app/.next/static ./.next/static
COPY --from=build --chown=lunas:lunas /app/public ./public
USER lunas
EXPOSE 3000
CMD ["node", "server.js"]
