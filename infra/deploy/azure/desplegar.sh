#!/usr/bin/env bash
# Despliegue gradual de una Container App de Mirai con vuelta atrás automática (equivalente Azure de
# infra/cloudbuild/scripts/rollout.sh). Lo llama .github/workflows (deploy en Azure) con OIDC ya iniciado (azure/login).
#
# Modo de revisiones Multiple (web, api, postgrest):
#   1. Fija el tráfico actual en revisiones explícitas (si no, la revisión nueva recibiría el 100 % al nacer).
#   2. `az containerapp update --image` crea la revisión nueva SIN tráfico y le pone la etiqueta "canary".
#   3. Prueba de humo por la URL de la etiqueta (https://<app>---canary.<dominio>) o CANARY_URL.
#   4. Mueve el tráfico por STEPS (p. ej. 10,50); en cada paso espera BAKE segundos y revisa que la revisión siga sana
#      (runningState/healthState) y su proporción de 5xx (métrica Requests de Azure Monitor) frente a MAX_RATIO.
#   5. Termina con el 100 % en "la más reciente" (lo que espera Terraform) y desactiva las revisiones sin tráfico.
#   Si algo falla: devuelve el reparto anterior exacto, desactiva la revisión nueva y sale con 1.
# Modo Single (realtime, por la afinidad de sesión): no hay canario posible; actualiza, espera que la revisión quede
#   sana y prueba de humo; si falla, vuelve a la imagen anterior.
#
# Variables: MIRAI_ENV SERVICE IMAGE AZURE_RESOURCE_GROUP [CANARY_URL SMOKE_PATH STEPS BAKE MAX_RATIO MIN_REQUESTS
#            REVISION_SUFFIX READY_TIMEOUT]
set -euo pipefail

: "${MIRAI_ENV:?Falta MIRAI_ENV}" "${SERVICE:?Falta SERVICE}" "${IMAGE:?Falta IMAGE}" "${AZURE_RESOURCE_GROUP:?Falta AZURE_RESOURCE_GROUP}"
CANARY_URL="${CANARY_URL:-}"
SMOKE_PATH="${SMOKE_PATH:-/healthz}"
STEPS="${STEPS:-10,50}"
BAKE="${BAKE:-300}"
MAX_RATIO="${MAX_RATIO:-0.02}"
MIN_REQUESTS="${MIN_REQUESTS:-20}"
READY_TIMEOUT="${READY_TIMEOUT:-600}"
SUFFIX="${REVISION_SUFFIX:-r$(date -u +%y%m%d%H%M%S)}"
TAG="canary"
G=(--name "$SERVICE" --resource-group "$AZURE_RESOURCE_GROUP")

log() { echo "[desplegar ${SERVICE}] $*"; }
show() { az containerapp show "${G[@]}" --query "$1" -o tsv; }

APP_ID="$(show id)"
MODE="$(show properties.configuration.activeRevisionsMode)"
FQDN="$(show properties.configuration.ingress.fqdn || true)"
PREV_LATEST="$(show properties.latestRevisionName)"
PREV_IMAGE="$(show 'properties.template.containers[0].image')"
NEW="${SERVICE}--${SUFFIX}"

# Espera a que una revisión esté corriendo y sana; falla si queda en Failed/Degraded o se pasa del tiempo.
wait_ready() {
  local rev="$1" t=0 state health
  while (( t < READY_TIMEOUT )); do
    state="$(az containerapp revision show "${G[@]}" --revision "$rev" --query properties.runningState -o tsv 2>/dev/null || true)"
    health="$(az containerapp revision show "${G[@]}" --revision "$rev" --query properties.healthState -o tsv 2>/dev/null || true)"
    case "$state" in
      Running|RunningAtMaxScale) [[ "$health" == "Healthy" || "$health" == "None" || -z "$health" ]] && { log "revisión $rev lista ($state, $health)"; return 0; } ;;
      Failed|Degraded|Stopped) log "la revisión $rev quedó en $state ($health)"; return 1 ;;
    esac
    sleep 10; t=$(( t + 10 ))
  done
  log "la revisión $rev no quedó lista en ${READY_TIMEOUT} s (estado: ${state:-?}, salud: ${health:-?})"; return 1
}

smoke() {
  local url="$1" code i
  for i in $(seq 1 12); do
    code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "$url" || true)"
    [[ "$code" == "200" ]] && { log "prueba de humo OK ($url)"; return 0; }
    log "prueba de humo $i/12: HTTP $code en $url"; sleep 10
  done
  return 1
}

# Suma de la métrica Requests de la revisión en los últimos BAKE segundos (con filtro extra opcional).
requests() {
  local extra="${1:-}" start
  start="$(date -u -d "-${BAKE} seconds" +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u -v-"${BAKE}"S +%Y-%m-%dT%H:%M:%SZ)"
  az monitor metrics list --resource "$APP_ID" --metric Requests --aggregation Total --interval PT1M \
    --start-time "$start" --filter "revisionName eq '${NEW}'${extra}" \
    --query 'value[0].timeseries[].data[].total' -o tsv 2>/dev/null | awk '$1 != "None" && $1 != "" { s += $1 } END { printf "%d", s }'
}

check_errors() {
  local total errors
  total="$(requests)"
  errors="$(requests " and statusCodeCategory eq '5xx'")"
  log "revisión $NEW: $total peticiones, $errors con 5xx (últimos ${BAKE} s)"
  if (( total >= MIN_REQUESTS )); then
    awk -v e="$errors" -v t="$total" -v m="$MAX_RATIO" 'BEGIN { exit (e / t > m) ? 1 : 0 }' || { log "5xx por encima de ${MAX_RATIO}"; return 1; }
  else
    log "pocas peticiones para juzgar los 5xx (mínimo ${MIN_REQUESTS}); se revisa solo la salud"
  fi
  wait_ready "$NEW"
}

# ── Modo Single (realtime) ─────────────────────────────────────────────────────────────────────────────────────
if [[ "$MODE" == "Single" ]]; then
  log "modo Single: se actualiza directo (imagen anterior: $PREV_IMAGE)"
  az containerapp update "${G[@]}" --container-name app --image "$IMAGE" --revision-suffix "$SUFFIX" -o none
  if wait_ready "$NEW" && { [[ -z "$CANARY_URL" ]] || smoke "$CANARY_URL"; }; then
    log "listo: $NEW con el 100 %"; exit 0
  fi
  log "VUELTA ATRÁS → $PREV_IMAGE"
  az containerapp update "${G[@]}" --container-name app --image "$PREV_IMAGE" --revision-suffix "${SUFFIX}rb" -o none || true
  exit 1
fi

# ── Modo Multiple (canario) ────────────────────────────────────────────────────────────────────────────────────
# Reparto actual con nombres explícitos ("latestRevision" → la revisión más reciente de antes del despliegue).
mapfile -t PREV_ROWS < <(az containerapp ingress traffic show "${G[@]}" \
  --query "[?weight > \`0\`].[revisionName || '', to_string(latestRevision || \`false\`), to_string(weight)]" -o tsv)
PREV_SPEC=()
for row in "${PREV_ROWS[@]}"; do
  IFS=$'\t' read -r rev latest weight <<<"$row"
  [[ "$latest" == "true" || -z "$rev" ]] && rev="$PREV_LATEST"
  PREV_SPEC+=("${rev}=${weight}")
done
(( ${#PREV_SPEC[@]} > 0 )) || PREV_SPEC=("${PREV_LATEST}=100")
log "tráfico antes del despliegue: ${PREV_SPEC[*]}"

ROLLED=0
rollback() {
  if [[ "$ROLLED" == "1" ]]; then
    log "VUELTA ATRÁS → ${PREV_SPEC[*]}"
    az containerapp ingress traffic set "${G[@]}" --revision-weight "${PREV_SPEC[@]}" -o none || true
    az containerapp revision deactivate "${G[@]}" --revision "$NEW" -o none 2>/dev/null || true
  fi
}
trap 'rc=$?; if [[ $rc -ne 0 ]]; then rollback; fi; exit $rc' EXIT

# 1. Tráfico fijo en las revisiones actuales para que la nueva nazca con 0 %.
az containerapp ingress traffic set "${G[@]}" --revision-weight "${PREV_SPEC[@]}" -o none
ROLLED=1

# 2. Revisión nueva sin tráfico, con la etiqueta canary.
log "desplegando $IMAGE como $NEW (sin tráfico)"
az containerapp update "${G[@]}" --container-name app --image "$IMAGE" --revision-suffix "$SUFFIX" -o none
wait_ready "$NEW"
az containerapp revision label add "${G[@]}" --label "$TAG" --revision "$NEW" --yes -o none

# 3. Prueba de humo por la etiqueta.
if [[ -z "$CANARY_URL" && -n "$FQDN" ]]; then
  CANARY_URL="https://${SERVICE}---${TAG}.${FQDN#"${SERVICE}."}${SMOKE_PATH}"
fi
if [[ -n "$CANARY_URL" ]]; then
  smoke "$CANARY_URL" || { log "la prueba de humo falló; la revisión nueva no recibió tráfico"; exit 1; }
else
  log "sin URL de canario (servicio sin ingress): se omite la prueba de humo"
fi

# 4. Tráfico por pasos.
if [[ "${PREV_SPEC[*]}" == "${NEW}=100" ]]; then
  log "no había revisión previa con tráfico"
else
  IFS=',' read -ra PASOS <<<"$STEPS"
  for p in "${PASOS[@]}"; do
    log "paso: ${p} % a $NEW"
    az containerapp ingress traffic set "${G[@]}" --revision-weight "${NEW}=${p}" "${PREV_SPEC[0]%%=*}=$(( 100 - p ))" -o none
    sleep "$BAKE"
    check_errors
  done
fi

# 5. 100 % a la más reciente (estado que espera Terraform) y limpieza.
az containerapp ingress traffic set "${G[@]}" --revision-weight latest=100 -o none
ROLLED=0
for rev in $(az containerapp revision list "${G[@]}" --query "[?properties.active && properties.trafficWeight == \`0\` && name != '${NEW}'].name" -o tsv); do
  az containerapp revision deactivate "${G[@]}" --revision "$rev" -o none || true
done
log "listo: $NEW con el 100 %"
