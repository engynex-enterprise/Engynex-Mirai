#!/usr/bin/env bash
# Migraciones SQL en GCP: cambia la imagen del trabajo de Cloud Run <prefijo>-db-migrate (la imagen aprobada de la API),
# lo ejecuta dentro de la VPC (Cloud SQL solo tiene IP privada) y espera el resultado. Misma interfaz que
# infra/deploy/{aws,azure}/migrar.sh. Las migraciones son aditivas: corren ANTES de mover tráfico.
#
# Variables: MIRAI_ENV IMAGE GCP_PROJECT GCP_REGION [MIGRATE_JOB]
set -euo pipefail

: "${MIRAI_ENV:?Falta MIRAI_ENV}" "${IMAGE:?Falta IMAGE}" "${GCP_PROJECT:?Falta GCP_PROJECT}" "${GCP_REGION:?Falta GCP_REGION}"
JOB="${MIGRATE_JOB:-mirai-${MIRAI_ENV}-db-migrate}"
G=(--project "$GCP_PROJECT" --region "$GCP_REGION" --quiet)

log() { echo "[migrar ${JOB}] $*"; }

if ! gcloud run jobs describe "$JOB" "${G[@]}" >/dev/null 2>&1; then
  log "no existe el trabajo (features.postgres apagado): nada que migrar"
  exit 0
fi

log "imagen: $IMAGE"
gcloud run jobs update "$JOB" --image "$IMAGE" "${G[@]}"
gcloud run jobs execute "$JOB" --wait "${G[@]}"
log "migraciones aplicadas"
