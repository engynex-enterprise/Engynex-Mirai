# syntax=docker/dockerfile:1
# Imagen de la web de Mirai (Next.js 16, output: "standalone") para cualquier nube: Cloud Run, ECS Fargate o Azure
# Container Apps (v7, web sin Vercel). Contexto: raíz del repositorio. BuildKit usa web.Dockerfile.dockerignore.
#   docker build -f infra/docker/web.Dockerfile --build-arg WEB_BUILD_ENV_B64=… --build-arg GIT_SHA=$(git rev-parse HEAD) -t web .
#
# - turbo prune deja solo apps/web y sus paquetes (@mirai/domain, db, contracts, config).
# - Los NEXT_PUBLIC_* se incrustan al compilar: llegan en WEB_BUILD_ENV_B64 (base64 de un .env) desde GitHub Actions
#   (variable WEB_BUILD_ENV del entorno, salida ci_variables de Terraform) o Cloud Build, así que la imagen es por
#   ambiente hasta que D16 (configuración pública en tiempo de ejecución, V7-O en apps/web) permita una sola imagen.
#   Los secretos NO entran a la imagen: la plataforma los monta (Secret Manager, Secrets Manager o Key Vault).
# - output: "standalone" está en apps/web/next.config.ts. GIT_SHA alimenta NEXT_PUBLIC_BUILD_ID (aviso "Hay una
#   versión nueva", /api/public/version) por VERCEL_GIT_COMMIT_SHA hasta que next.config.ts lea GIT_SHA.
# - /_next/static y /public salen con Cache-Control de Next (immutable / no-cache para sw.js y el manifest): el CDN
#   de cada nube los respeta (Cloud CDN USE_ORIGIN_HEADERS, CloudFront, Front Door).

# La misma serie de Node.js que usaba Vercel en producción (26.x).
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
# GIT_SHA (neutro) y VERCEL_GIT_COMMIT_SHA (lo que hoy lee next.config.ts) → NEXT_PUBLIC_BUILD_ID.
ENV GIT_SHA=${GIT_SHA} \
    VERCEL_GIT_COMMIT_SHA=${GIT_SHA}
# Marcadores SOLO para compilar (apps/web/lib/env.ts exige que existan, igual que .github/workflows/ci.yml; se van
# con V7-R cuando la web ya no tenga secretos de Supabase).
# Van dentro del RUN, no como ENV: no quedan en ninguna capa. Los reales llegan en Cloud Run desde Secret Manager.
RUN if [ -n "$WEB_BUILD_ENV_B64" ]; then printf '%s' "$WEB_BUILD_ENV_B64" | base64 -d > apps/web/.env.production; fi && \
    SUPABASE_SECRET_KEY=build-placeholder-no-real-secret \
    ENCRYPTION_KEY=Y2ktcGxhY2Vob2xkZXItMzItYnl0ZXMtYmFzZTY0LXh4eA== \
    CRON_SECRET=build-placeholder-cron-secret \
    pnpm turbo run build --filter=web && \
    test -f apps/web/.next/standalone/apps/web/server.js || \
      (echo "No se generó la salida standalone (apps/web/.next/standalone/apps/web/server.js): revisa output en next.config.ts." && exit 1)

# ── 4. Imagen final (sin pnpm, sin código fuente, sin dependencias de desarrollo) ───────────────────────────────
FROM node:${NODE_VERSION}-bookworm-slim AS runtime
ARG GIT_SHA=dev
LABEL org.opencontainers.image.source="https://github.com/engynex/mirai" \
      org.opencontainers.image.revision="${GIT_SHA}" \
      org.opencontainers.image.title="mirai-web"
ENV NODE_ENV=production \
    PORT=8080 \
    HOSTNAME=0.0.0.0 \
    NEXT_TELEMETRY_DISABLED=1 \
    GIT_SHA=${GIT_SHA}
WORKDIR /app
COPY --from=build --chown=node:node /repo/apps/web/.next/standalone ./
COPY --from=build --chown=node:node /repo/apps/web/.next/static ./apps/web/.next/static
COPY --from=build --chown=node:node /repo/apps/web/public ./apps/web/public
USER node
EXPOSE 8080
# Chequeo para Docker/Compose y ECS (Cloud Run y Container Apps usan sus propias sondas). Sin curl en la imagen.
HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:'+(process.env.PORT||8080)+'/api/public/version').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"]
CMD ["node", "apps/web/server.js"]
