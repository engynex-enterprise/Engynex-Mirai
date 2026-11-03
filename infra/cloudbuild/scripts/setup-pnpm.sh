#!/usr/bin/env bash
# Instala la versión exacta de pnpm de "packageManager" (Node 25+ ya no trae corepack).
set -euo pipefail
PNPM_VERSION="$(node -p "require('./package.json').packageManager.split('@')[1].split('+')[0]")"
npm install -g --no-fund --no-audit "pnpm@${PNPM_VERSION}" >/dev/null
pnpm --version
