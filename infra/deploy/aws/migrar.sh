#!/usr/bin/env bash
# Corre las migraciones SQL en AWS: el trabajo <prefijo>-db-migrate (definición de tarea de Fargate con la imagen de
# la API y DATABASE_URL = secreto database-admin-url) dentro de las subredes privadas, y falla si el contenedor no
# termina con código 0. Antes guarda la imagen en SSM (/<SERVICE>/image) y registra una revisión con ella.
#
# Variables: MIRAI_ENV IMAGE AWS_REGION ECS_CLUSTER [SERVICE (por defecto mirai-<MIRAI_ENV>-db-migrate)
#            MIGRATE_SUBNETS MIGRATE_SECURITY_GROUPS (separados por coma; si faltan se buscan por etiquetas)]
set -euo pipefail

: "${MIRAI_ENV:?Falta MIRAI_ENV}" "${IMAGE:?Falta IMAGE}" "${AWS_REGION:?Falta AWS_REGION}" "${ECS_CLUSTER:?Falta ECS_CLUSTER}"
SERVICE="${SERVICE:-mirai-${MIRAI_ENV}-db-migrate}"
export AWS_REGION AWS_DEFAULT_REGION="$AWS_REGION"
log() { echo "[migrar ${SERVICE}] $*"; }
command -v jq >/dev/null || { log "falta jq"; exit 1; }

SUBNETS="${MIGRATE_SUBNETS:-}"
SGS="${MIGRATE_SECURITY_GROUPS:-}"
if [[ -z "$SUBNETS" ]]; then
  SUBNETS="$(aws ec2 describe-subnets --filters "Name=tag:ambiente,Values=${MIRAI_ENV}" "Name=tag:tier,Values=privada" \
    --query 'Subnets[].SubnetId' --output text | tr '\t' ',')"
fi
if [[ -z "$SGS" ]]; then
  SGS="$(aws ec2 describe-security-groups --filters "Name=group-name,Values=mirai-${MIRAI_ENV}-tareas" \
    --query 'SecurityGroups[].GroupId' --output text | tr '\t' ',')"
fi
[[ -n "$SUBNETS" && -n "$SGS" ]] || { log "no encontré subredes privadas o el grupo de seguridad de las tareas"; exit 1; }

aws ssm put-parameter --name "/${SERVICE}/image" --type String --value "$IMAGE" --overwrite >/dev/null
aws ecs describe-task-definition --task-definition "$SERVICE" --output json \
  | jq --arg img "$IMAGE" '.taskDefinition
      | .containerDefinitions |= map(if .name == "migrate" then .image = $img else . end)
      | del(.taskDefinitionArn, .revision, .status, .requiresAttributes, .compatibilities, .registeredAt, .registeredBy, .deregisteredAt)' \
  > /tmp/td-migrar.json
TD="$(aws ecs register-task-definition --cli-input-json file:///tmp/td-migrar.json --query 'taskDefinition.taskDefinitionArn' --output text)"
log "revisión ${TD}"

NET="awsvpcConfiguration={subnets=[${SUBNETS}],securityGroups=[${SGS}],assignPublicIp=DISABLED}"
TASK="$(aws ecs run-task --cluster "$ECS_CLUSTER" --task-definition "$TD" --launch-type FARGATE \
  --network-configuration "$NET" --started-by "migrar-${MIRAI_ENV}" --query 'tasks[0].taskArn' --output text)"
[[ -n "$TASK" && "$TASK" != "None" ]] || { log "no se pudo lanzar la tarea"; exit 1; }
log "tarea ${TASK}: esperando a que termine…"
aws ecs wait tasks-stopped --cluster "$ECS_CLUSTER" --tasks "$TASK"

CODE="$(aws ecs describe-tasks --cluster "$ECS_CLUSTER" --tasks "$TASK" --query 'tasks[0].containers[?name==`migrate`].exitCode | [0]' --output text)"
REASON="$(aws ecs describe-tasks --cluster "$ECS_CLUSTER" --tasks "$TASK" --query 'tasks[0].stoppedReason' --output text)"
if [[ "$CODE" != "0" ]]; then
  log "las migraciones fallaron (código ${CODE}; ${REASON}). Registros: grupo /ecs/mirai-${MIRAI_ENV}, prefijo db-migrate"
  exit 1
fi
log "migraciones aplicadas"
