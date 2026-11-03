# Salidas comunes: los MISMOS nombres en clouds/{gcp,aws,azure}/stack (lo revisa scripts/contrato.py).

output "edge_address" {
  description = "Dominio de CloudFront (los dominios del ambiente van como CNAME a este)."
  value       = var.features.edge ? module.edge[0].ip_or_cname : null
}

output "dns_records" {
  description = "Registros a crear en Hostinger: CNAME de validación de ACM primero, CNAME de cada dominio al hacer el corte."
  value       = local.edge_records
}

output "service_urls" {
  description = "URL internas (Service Connect) de cada servicio."
  value = merge(
    { web = module.web.internal_url, api = module.api.internal_url },
    var.features.realtime ? { realtime = module.realtime[0].internal_url } : {},
    local.worker_on ? { worker = module.worker[0].internal_url } : {},
    var.features.postgrest ? { postgrest = module.postgrest[0].internal_url } : {},
  )
}

output "identities" {
  description = "Identidad → ARN del rol de IAM."
  value       = module.identity.principals
}

output "secret_ids" {
  description = "Clave → nombre del secreto en Secrets Manager (para cargar valores)."
  value       = module.secrets.ids
}

output "buckets" {
  description = "Propósito → bucket de S3."
  value       = var.features.storage ? module.storage[0].bucket_names : {}
}

output "queues" {
  description = "Colas de SQS (vacío con QUEUE_DRIVER=http)."
  value       = module.queue.queue_names
}

output "scheduler_jobs" {
  description = "Programaciones de EventBridge Scheduler."
  value       = module.scheduler.job_ids
}

output "nat_ips" {
  description = "IP fijas de salida (NAT Gateway)."
  value       = module.network.nat_ips
}

output "postgres" {
  description = "RDS: instancia, host y base (sin contraseñas)."
  value = var.features.postgres ? {
    instance_id     = module.postgres[0].instance_id
    host            = module.postgres[0].host
    port            = module.postgres[0].port
    database        = module.postgres[0].database
    connection_name = module.postgres[0].connection_name
  } : null
}

output "redis_host" {
  description = "Endpoint de ElastiCache."
  value       = var.features.redis ? module.redis[0].host : null
}

output "web_build_env_b64" {
  description = "NEXT_PUBLIC_* del build de la web en base64 (WEB_BUILD_ENV_B64)."
  value       = module.app.web_build_env_b64
}

output "ci_variables" {
  description = "Variables del entorno de GitHub (Settings › Environments › <ambiente> › Variables) para el despliegue en AWS."
  value = {
    MIRAI_CLOUD             = "aws"
    MIRAI_REGISTRY          = var.aws.registry_url
    MIRAI_SERVICE_WEB       = local.names.web
    MIRAI_SERVICE_API       = local.names.api
    MIRAI_SERVICE_REALTIME  = var.features.realtime ? local.names.realtime : ""
    MIRAI_SERVICE_WORKER    = local.worker_on ? local.names.worker : ""
    MIRAI_MIGRATE_JOB       = var.features.postgres ? local.names.migrate : ""
    MIRAI_CANARY_WEB_URL    = ""
    MIRAI_CANARY_API_URL    = ""
    MIRAI_SMOKE_URL         = "https://${var.domains.web}/api/public/version"
    WEB_BUILD_ENV           = module.app.web_build_env_text
    AWS_REGION              = var.region
    ECS_CLUSTER             = module.platform.platform.cluster_name
    MIGRATE_SUBNETS         = join(",", module.network.network.private_subnet_ids)
    MIGRATE_SECURITY_GROUPS = module.platform.platform.tasks_sg_id
  }
}
