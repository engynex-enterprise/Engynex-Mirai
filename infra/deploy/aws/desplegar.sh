#!/usr/bin/env bash
# Despliegue de un servicio de ECS Fargate (AWS) con vuelta atrás automática.
#   1. Guarda la imagen aprobada en el parámetro de SSM /<SERVICE>/image (así un `terraform apply` posterior no la
#      revierte: capabilities/container-service/aws).
#   2. Registra una revisión nueva de la definición de tarea (la última ACTIVA de la familia, con la imagen nueva).
#   3. update-service y espera a que quede estable. ECS revierte solo si el circuit breaker o la alarma de 5xx del
#      grupo de destino se disparan (bloque `alarms` del servicio); si eso pasa, este script falla.
#   4. Prueba de humo opcional (CANARY_URL) y revisión de la proporción de 5xx durante BAKE segundos (MAX_RATIO);
#      si falla, vuelve a la revisión anterior.
# ECS no tiene revisiones etiquetadas con 0 % de tráfico como Cloud Run: STEPS no aplica (el reemplazo es gradual,
# mínimo 100 % sano y máximo 200 %).
#
# Variables: MIRAI_ENV SERVICE IMAGE AWS_REGION ECS_CLUSTER [CANARY_URL BAKE MAX_RATIO MIN_REQUESTS STEPS]
set -euo pipefail

: "${MIRAI_ENV:?Falta MIRAI_ENV}" "${SERVICE:?Falta SERVICE}" "${IMAGE:?Falta IMAGE}"
: "${AWS_REGION:?Falta AWS_REGION}" "${ECS_CLUSTER:?Falta ECS_CLUSTER}"
CANARY_URL="${CANARY_URL:-}"
BAKE="${BAKE:-300}"
MAX_RATIO="${MAX_RATIO:-0.02}"
MIN_REQUESTS="${MIN_REQUESTS:-20}"
STEPS="${STEPS:-}"
export AWS_REGION AWS_DEFAULT_REGION="$AWS_REGION"

log() { echo "[desplegar ${SERVICE}] $*"; }
command -v jq >/dev/null || { log "falta jq"; exit 1; }
[[ -n "$STEPS" ]] && log "STEPS=${STEPS} se ignora en AWS (ECS reemplaza tareas de forma gradual)"

svc_json() { aws ecs describe-services --cluster "$ECS_CLUSTER" --services "$SERVICE" --output json; }

PREV_TD="$(svc_json | jq -r '.services[0].taskDefinition')"
[[ "$PREV_TD" != "null" && -n "$PREV_TD" ]] || { log "el servicio no existe en ${ECS_CLUSTER} (¿se aplicó Terraform?)"; exit 1; }
log "revisión actual: ${PREV_TD}"

log "guardando la imagen en SSM (/${SERVICE}/image)"
aws ssm put-parameter --name "/${SERVICE}/image" --type String --value "$IMAGE" --overwrite >/dev/null

# La última revisión ACTIVA de la familia (la que dejó Terraform o el último despliegue), con la imagen nueva.
FAMILY="${SERVICE}"
aws ecs describe-task-definition --task-definition "$FAMILY" --output json \
  | jq --arg img "$IMAGE" '.taskDefinition
      | .containerDefinitions |= map(if .name == "app" then .image = $img else . end)
      | del(.taskDefinitionArn, .revision, .status, .requiresAttributes, .compatibilities, .registeredAt, .registeredBy, .deregisteredAt)' \
  > /tmp/td-nueva.json
NEW_TD="$(aws ecs register-task-definition --cli-input-json file:///tmp/td-nueva.json --query 'taskDefinition.taskDefinitionArn' --output text)"
log "revisión nueva: ${NEW_TD}"

rollback() {
  log "VUELTA ATRÁS → ${PREV_TD}"
  aws ecs update-service --cluster "$ECS_CLUSTER" --service "$SERVICE" --task-definition "$PREV_TD" >/dev/null || true
  aws ssm put-parameter --name "/${SERVICE}/image" --type String --overwrite \
    --value "$(aws ecs describe-task-definition --task-definition "$PREV_TD" --query 'taskDefinition.containerDefinitions[?name==`app`].image | [0]' --output text)" >/dev/null || true
}

aws ecs update-service --cluster "$ECS_CLUSTER" --service "$SERVICE" --task-definition "$NEW_TD" >/dev/null
log "esperando a que el servicio quede estable…"
if ! aws ecs wait services-stable --cluster "$ECS_CLUSTER" --services "$SERVICE"; then
  log "el servicio no quedó estable"; rollback; exit 1
fi

# Si ECS revirtió (circuit breaker o alarma), la revisión en uso ya no es la nueva.
CUR_TD="$(svc_json | jq -r '.services[0].taskDefinition')"
STATE="$(svc_json | jq -r '[.services[0].deployments[] | select(.status=="PRIMARY")][0].rolloutState // ""')"
if [[ "$CUR_TD" != "$NEW_TD" || "$STATE" == "FAILED" ]]; then
  log "ECS revirtió el despliegue (estado: ${STATE:-desconocido}, en uso: ${CUR_TD})"; exit 1
fi
log "revisión ${NEW_TD} estable"

if [[ -n "$CANARY_URL" ]]; then
  ok=0
  for i in $(seq 1 12); do
    code="$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "$CANARY_URL" || true)"
    if [[ "$code" == "200" ]]; then ok=1; break; fi
    log "prueba de humo $i/12: HTTP $code en $CANARY_URL"; sleep 10
  done
  [[ "$ok" == "1" ]] || { log "la prueba de humo falló"; rollback; exit 1; }
  log "prueba de humo OK ($CANARY_URL)"
fi

# Proporción de 5xx del grupo de destino durante BAKE segundos (solo servicios detrás del ALB).
TG_ARN="$(svc_json | jq -r '.services[0].loadBalancers[0].targetGroupArn // ""')"
if [[ -n "$TG_ARN" && "$BAKE" -gt 0 ]]; then
  log "observando 5xx durante ${BAKE} s (máximo ${MAX_RATIO})"
  sleep "$BAKE"
  TG_SUFFIX="${TG_ARN#*:targetgroup/}"; TG_SUFFIX="targetgroup/${TG_SUFFIX}"
  LB_ARN="$(aws elbv2 describe-target-groups --target-group-arns "$TG_ARN" --query 'TargetGroups[0].LoadBalancerArns[0]' --output text)"
  LB_SUFFIX="${LB_ARN#*:loadbalancer/}"
  START="$(date -u -d "-${BAKE} seconds" +%Y-%m-%dT%H:%M:%SZ 2>/dev/null || date -u -v-"${BAKE}"S +%Y-%m-%dT%H:%M:%SZ)"
  END="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
  q() {
    aws cloudwatch get-metric-statistics --namespace AWS/ApplicationELB --metric-name "$1" \
      --dimensions Name=TargetGroup,Value="$TG_SUFFIX" Name=LoadBalancer,Value="$LB_SUFFIX" \
      --start-time "$START" --end-time "$END" --period 60 --statistics Sum \
      --query 'sum(Datapoints[].Sum)' --output text 2>/dev/null | sed 's/None/0/'
  }
  TOTAL="$(q RequestCount)"; ERR="$(q HTTPCode_Target_5XX_Count)"
  TOTAL="${TOTAL%.*}"; ERR="${ERR%.*}"; TOTAL="${TOTAL:-0}"; ERR="${ERR:-0}"
  log "${TOTAL} peticiones, ${ERR} con 5xx"
  if (( TOTAL >= MIN_REQUESTS )) && awk -v e="$ERR" -v t="$TOTAL" -v m="$MAX_RATIO" 'BEGIN { exit !(e / t > m) }'; then
    log "demasiados 5xx"; rollback; exit 1
  fi
fi

log "despliegue terminado (${MIRAI_ENV})"
