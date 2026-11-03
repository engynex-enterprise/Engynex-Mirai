#!/usr/bin/env bash
# Migraciones SQL en Azure: actualiza la imagen del Container Apps Job <prefijo>-db-migrate (la misma imagen aprobada de
# la API), lo ejecuta dentro de la red privada (el servidor de Postgres no tiene IP pública) y espera el resultado.
# Las migraciones son aditivas (CLAUDE.md): corren ANTES de mover tráfico a la revisión nueva.
#
# Variables: MIRAI_ENV IMAGE AZURE_RESOURCE_GROUP [MIGRATE_JOB MIGRATE_TIMEOUT]
set -euo pipefail

: "${MIRAI_ENV:?Falta MIRAI_ENV}" "${IMAGE:?Falta IMAGE}" "${AZURE_RESOURCE_GROUP:?Falta AZURE_RESOURCE_GROUP}"
JOB="${MIGRATE_JOB:-mirai-${MIRAI_ENV}-db-migrate}"
TIMEOUT="${MIGRATE_TIMEOUT:-1800}"
G=(--name "$JOB" --resource-group "$AZURE_RESOURCE_GROUP")

log() { echo "[migrar ${JOB}] $*"; }

log "imagen: $IMAGE"
az containerapp job update "${G[@]}" --image "$IMAGE" -o none

EXEC="$(az containerapp job start "${G[@]}" --query name -o tsv)"
[[ -n "$EXEC" ]] || { log "no se pudo iniciar la ejecución"; exit 1; }
log "ejecución: $EXEC"

t=0
while (( t < TIMEOUT )); do
  STATUS="$(az containerapp job execution show "${G[@]}" --job-execution-name "$EXEC" --query properties.status -o tsv 2>/dev/null || true)"
  case "$STATUS" in
    Succeeded) log "migraciones aplicadas"; exit 0 ;;
    Failed|Stopped|Degraded)
      log "la ejecución terminó en $STATUS. Registros: az containerapp job logs show ${G[*]} --execution $EXEC --container db-migrate"
      exit 1 ;;
  esac
  sleep 10; t=$(( t + 10 ))
done
log "la ejecución no terminó en ${TIMEOUT} s (último estado: ${STATUS:-?})"
exit 1
