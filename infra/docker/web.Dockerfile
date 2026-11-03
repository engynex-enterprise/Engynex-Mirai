# syntax=docker/dockerfile:1
# Imagen de la web de Mirai (Next.js 16 standalone) para Cloud Run.
# Contexto: raíz del repositorio. BuildKit usa infra/docker/web.Dockerfile.dockerignore.
#   docker build -f infra/docker/web.Dockerfile --build-arg WEB_BUILD_ENV_B64=… -t web .
#
# - turbo prune deja solo apps/web y sus paquetes (@mirai/domain, db, contracts, config).
# - Los NEXT_PUBLIC_* se incrustan al compilar: llegan en WEB_BUILD_ENV_B64 (base64 de un .env) desde Cloud Build,
#   así la imagen es por ambiente. Los secretos NO entran a la imagen: Cloud Run los monta desde Secret Manager.
# - NEXT_PRIVATE_STANDALONE=1 activa output: "standalone" sin tocar next.config.ts (lo lee el valor por defecto de
#   Next 16). Cuando se pueda editar apps/web, conviene declararlo ahí (docs/infra/estrategia-gcp.md §9).

# La misma serie de Node.js que usa Vercel en producción (26.x).
ARG NODE_VERSION=26

FROM node:${NODE_VERSION}-bookworm-slim AS base
ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    NEXT_TELEMETRY_DISABLED=1 \
    TURBO_TELEMETRY_DISABLED=1
# Node 25+ ya no trae corepack: se instala la versión exacta de "packageManager" del package.json raíz.
COPY package.json /tmp/root-package.json
RUN npm install -g --no-fund --no-audit \
      "pnpm@$(node -p "require('/tmp/root-package.json').packageManager.split('@')[1].split('+')[0]")"
WORKDIR /repo

# ── 1. Podar el monorepo ────────────────────────────────────────────────────────────────────────────────────────
FROM base AS prune
ARG TURBO_VERSION=2.11.10
COPY . .
RUN pnpm dlx turbo@${TURBO_VERSION} prune web --docker

# ── 2. Dependencias (capa en caché mientras no cambien package.json ni el lockfile) ─────────────────────────────
FROM base AS deps
COPY --from=prune /repo/out/json/ .
COPY --from=prune /repo/out/pnpm-lock.yaml ./pnpm-lock.yaml
COPY pnpm-workspace.yaml ./pnpm-workspace.yaml
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm config set store-dir /pnpm/store && \
    pnpm install --frozen-lockfile

# ── 3. Compilar ─────────────────────────────────────────────────────────────────────────────────────────────────
FROM deps AS build
COPY --from=prune /repo/out/full/ .
ARG WEB_BUILD_ENV_B64=""
ARG GIT_SHA=dev
# VERCEL_GIT_COMMIT_SHA alimenta NEXT_PUBLIC_BUILD_ID (next.config.ts) para el aviso "Hay una versión nueva".
ENV NEXT_PRIVATE_STANDALONE=1 \
    VERCEL_GIT_COMMIT_SHA=${GIT_SHA}
# Marcadores SOLO para compilar (apps/web/lib/env.ts exige que existan, igual que .github/workflows/ci.yml).
# Van dentro del RUN, no como ENV: no quedan en ninguna capa. Los reales llegan en Cloud Run desde Secret Manager.
RUN if [ -n "$WEB_BUILD_ENV_B64" ]; then printf '%s' "$WEB_BUILD_ENV_B64" | base64 -d > apps/web/.env.production; fi && \
    SUPABASE_SECRET_KEY=build-placeholder-no-real-secret \
    ENCRYPTION_KEY=Y2ktcGxhY2Vob2xkZXItMzItYnl0ZXMtYmFzZTY0LXh4eA== \
    CRON_SECRET=build-placeholder-cron-secret \
    pnpm turbo run build --filter=web && \
    test -f apps/web/.next/standalone/apps/web/server.js || \
      (echo "No se generó la salida standalone (apps/web/.next/standalone/apps/web/server.js). Ver docs/infra/estrategia-gcp.md §9." && exit 1)

# ── 4. Imagen final (sin pnpm, sin código fuente, sin dependencias de desarrollo) ───────────────────────────────
FROM node:${NODE_VERSION}-bookworm-slim AS runtime
ARG GIT_SHA=dev
LABEL org.opencontainers.image.source="https://github.com/engynex/mirai" \
      org.opencontainers.image.revision="${GIT_SHA}" \
      org.opencontainers.image.title="mirai-web"
ENV NODE_ENV=production \
    PORT=8080 \
    HOSTNAME=0.0.0.0 \
    NEXT_TELEMETRY_DISABLED=1
WORKDIR /app
COPY --from=build --chown=node:node /repo/apps/web/.next/standalone ./
COPY --from=build --chown=node:node /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=node:node /repo/apps/web/public ./apps/web/public
USER node
EXPOSE 8080
CMD ["node", "apps/web/server.js"]
