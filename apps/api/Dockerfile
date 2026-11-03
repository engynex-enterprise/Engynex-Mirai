# syntax=docker/dockerfile:1.7
# Imagen de la API de Mirai para Cloud Run (F2-B-9, docs/arquitectura/v6-separacion-front-back.md §6.1).
# Se construye desde la RAÍZ del monorepo:
#   docker build -f apps/api/Dockerfile -t mirai-api .
# Etapas: prune (turbo prune api --docker: solo lo que la API necesita) → build (pnpm install + esbuild/swc +
# pnpm deploy --prod) → runtime (node:22-slim, usuario sin privilegios, solo dist/ y las dependencias de producción).
# Los secretos NO van en la imagen: Cloud Run los monta desde Secret Manager (--set-secrets). Ver apps/api/README.md.

ARG NODE_VERSION=22.23.2
ARG PNPM_VERSION=10.34.9
ARG TURBO_VERSION=2.11.10

FROM node:${NODE_VERSION}-slim AS base
ARG PNPM_VERSION
ENV PNPM_HOME=/pnpm PATH=/pnpm:$PATH CI=1
RUN npm install -g pnpm@${PNPM_VERSION} --no-fund --no-audit --loglevel=error
WORKDIR /repo

# 1) Poda: package.json + pnpm-lock.yaml podado (out/json) y fuentes (out/full) de api y sus paquetes @mirai/*.
FROM base AS prune
ARG TURBO_VERSION
COPY . .
RUN npx --yes turbo@${TURBO_VERSION} prune api --docker

# 2) Compilación. Primero solo los package.json (capa de caché de dependencias) y luego las fuentes.
FROM base AS build
COPY --from=prune /repo/out/json/ ./
# --ignore-scripts: evita bajar binarios que la API no usa (CLI de Supabase de @mirai/db, sharp…). esbuild y swc
# resuelven su binario nativo por las dependencias opcionales de la plataforma, sin postinstall.
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm config set store-dir /pnpm/store && \
    pnpm install --frozen-lockfile --ignore-scripts
COPY --from=prune /repo/out/full/ ./
RUN pnpm --filter api build \
 && pnpm --filter api deploy --prod --legacy --ignore-scripts /prod/api

# 3) Ejecución: sin pnpm, sin fuentes, sin herramientas de compilación.
FROM node:${NODE_VERSION}-slim AS runtime
ENV NODE_ENV=production PORT=8080 HOST=0.0.0.0
WORKDIR /app
COPY --from=build --chown=node:node /prod/api/package.json ./package.json
COPY --from=build --chown=node:node /prod/api/node_modules ./node_modules
COPY --from=build --chown=node:node /repo/apps/api/dist ./dist
# Usuario sin privilegios (uid 1000 de la imagen oficial de Node).
USER node
EXPOSE 8080
# Cloud Run manda SIGTERM al apagar: Node lo recibe directo (sin shell) y Nest cierra en orden.
CMD ["node", "--enable-source-maps", "dist/main.js"]
