#!/usr/bin/env bash
# Despliegue de un servicio de Cloud Run (GCP) con canario y vuelta atrás automática. Misma interfaz que
# infra/deploy/{aws,azure}/desplegar.sh (la llama .github/workflows/_desplegar.yml).
# Reusa infra/cloudbuild/scripts/rollout.sh (el mismo de Cloud Build): revisión sin tráfico con la etiqueta canary →
# humo por CANARY_URL (host canary-* del balanceador) → STEPS (10,50) con BAKE s mirando los 5xx en Cloud Monitoring →
# 100 %; si la proporción de 5xx supera MAX_RATIO, devuelve el tráfico que había y falla.
#
# Variables: MIRAI_ENV SERVICE IMAGE GCP_PROJECT GCP_REGION [CANARY_URL STEPS BAKE MAX_RATIO MIN_REQUESTS]
set -euo pipefail

: "${MIRAI_ENV:?Falta MIRAI_ENV}" "${SERVICE:?Falta SERVICE}" "${IMAGE:?Falta IMAGE}"
: "${GCP_PROJECT:?Falta GCP_PROJECT}" "${GCP_REGION:?Falta GCP_REGION}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

[[ "$IMAGE" == *@sha256:* ]] || { echo "[desplegar ${SERVICE}] IMAGE debe ir por digest (registro/imagen@sha256:…): se promueve lo que se probó"; exit 1; }

SERVICE="$SERVICE" REGION="$GCP_REGION" PROJECT="$GCP_PROJECT" IMAGE="$IMAGE" \
CANARY_URL="${CANARY_URL:-}" STEPS="${STEPS:-10,50}" BAKE="${BAKE:-300}" MAX_RATIO="${MAX_RATIO:-0.02}" \
MIN_REQUESTS="${MIN_REQUESTS:-20}" \
  bash "$HERE/../../cloudbuild/scripts/rollout.sh"
