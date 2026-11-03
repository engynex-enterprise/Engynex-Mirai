#!/usr/bin/env bash
# Despliegue gradual en Cloud Run con vuelta atrás automática.
#   1. Despliega la imagen SIN tráfico con la etiqueta "canary".
#   2. Prueba de humo por el balanceador (host canary-*) si hay CANARY_URL.
#   3. Mueve el tráfico por pasos (STEPS, p. ej. "10,50") y en cada uno espera BAKE segundos mirando la proporción de
#      5xx de la revisión nueva en Cloud Monitoring. Si supera MAX_RATIO (con al menos MIN_REQUESTS peticiones),
#      devuelve el tráfico exacto que había antes y falla el build.
#   4. Termina con el 100 % en "la más reciente" (estado que espera Terraform).
#
# Variables: SERVICE REGION PROJECT IMAGE [CANARY_URL STEPS BAKE MAX_RATIO MIN_REQUESTS TAG]
set -euo pipefail

: "${SERVICE:?Falta SERVICE}" "${REGION:?Falta REGION}" "${PROJECT:?Falta PROJECT}" "${IMAGE:?Falta IMAGE}"
CANARY_URL="${CANARY_URL:-}"
STEPS="${STEPS:-10,50}"
BAKE="${BAKE:-300}"
MAX_RATIO="${MAX_RATIO:-0.02}"
MIN_REQUESTS="${MIN_REQUESTS:-20}"
TAG="${TAG:-canary}"
HERE="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
G=(--project "$PROJECT" --region "$REGION" --quiet)

log() { echo "[rollout ${SERVICE}] $*"; }
describe() { gcloud run services describe "$SERVICE" "${G[@]}" --format=json; }

PREV_SPEC="$(describe | python3 "$HERE/rollout_helpers.py" traffic)"
PREV_MAIN="$(describe | python3 "$HERE/rollout_helpers.py" main-revision)"
log "tráfico antes del despliegue: ${PREV_SPEC:-<ninguno>}"

ROLLED=0
rollback() {
  if [[ "$ROLLED" == "1" && -n "$PREV_SPEC" ]]; then
    log "VUELTA ATRÁS → $PREV_SPEC"
    gcloud run services update-traffic "$SERVICE" --to-revisions "$PREV_SPEC" "${G[@]}" || true
  fi
}
trap 'rc=$?; if [[ $rc -ne 0 ]]; then rollback; fi; exit $rc' EXIT

log "desplegando $IMAGE sin tráfico (etiqueta $TAG)"
gcloud run deploy "$SERVICE" --image "$IMAGE" --no-traffic --tag "$TAG" "${G[@]}"

NEW="$(gcloud run services describe "$SERVICE" "${G[@]}" --format='value(status.latestCreatedRevisionName)')"
READY="$(gcloud run services describe "$SERVICE" "${G[@]}" --format='value(status.latestReadyRevisionName)')"
if [[ "$NEW" != "$READY" ]]; then
  log "la revisión $NEW no quedó lista (lista: $READY)"; exit 1
fi
log "revisión nueva: $NEW"

if [[ -n "$CANARY_URL" ]]; then
  ok=0
  for i in $(seq 1 12); do
    code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "$CANARY_URL" || true)"
    if [[ "$code" == "200" ]]; then ok=1; break; fi
    log "prueba de humo $i/12: HTTP $code en $CANARY_URL"; sleep 10
  done
  [[ "$ok" == "1" ]] || { log "la prueba de humo falló; la revisión nueva no recibió tráfico"; exit 1; }
  log "prueba de humo OK ($CANARY_URL)"
else
  log "sin CANARY_URL: se omite la prueba de humo previa"
fi

if [[ -z "$PREV_MAIN" || "$PREV_MAIN" == "$NEW" ]]; then
  log "no hay revisión previa con tráfico: 100 % a la nueva"
  gcloud run services update-traffic "$SERVICE" --to-latest "${G[@]}"
  exit 0
fi

check_errors() {
  local minutes=$(( (BAKE + 59) / 60 ))
  local out total errors
  out="$(ACCESS_TOKEN="$(gcloud auth print-access-token)" python3 "$HERE/rollout_helpers.py" errors \
    --project "$PROJECT" --service "$SERVICE" --revision "$NEW" --minutes "$minutes")"
  read -r total errors <<<"$out"
  log "revisión $NEW: $total peticiones, $errors con 5xx (últimos $minutes min)"
  if (( total >= MIN_REQUESTS )); then
    python3 - "$total" "$errors" "$MAX_RATIO" <<'PY'
import sys
total, errors, maxr = int(sys.argv[1]), int(sys.argv[2]), float(sys.argv[3])
sys.exit(1 if errors / total > maxr else 0)
PY
  fi
}

IFS=',' read -ra PCTS <<<"$STEPS"
for pct in "${PCTS[@]}"; do
  rest=$((100 - pct))
  log "tráfico: $NEW=$pct %, $PREV_MAIN=$rest %"
  ROLLED=1
  gcloud run services update-traffic "$SERVICE" --to-revisions "$NEW=$pct,$PREV_MAIN=$rest" "${G[@]}"
  log "esperando ${BAKE}s"
  sleep "$BAKE"
  # Las métricas de Cloud Run llegan con ~3 min de retraso: una espera corta solo ve parte del paso.
  if ! check_errors; then
    log "demasiados 5xx en $NEW (máx. $MAX_RATIO)"; exit 1
  fi
done

gcloud run services update-traffic "$SERVICE" --to-latest "${G[@]}"
ROLLED=0
log "listo: 100 % en $NEW (la más reciente). Para volver atrás: runbook §4."
