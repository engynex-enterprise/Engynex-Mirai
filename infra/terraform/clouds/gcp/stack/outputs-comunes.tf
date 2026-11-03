# Salidas COMUNES: los mismos nombres en clouds/{gcp,aws,azure}/stack (lo revisa scripts/contrato.py).

output "edge_address" {
  description = "IP pública del balanceador (registros A en Hostinger)."
  value       = local.f.edge ? module.lb[0].ip_or_cname : null
}

output "dns_records" {
  description = "Registros que hay que crear en el DNS (Hostinger): CNAME _acme-challenge primero, A al hacer el corte."
  value       = local.f.edge ? module.lb[0].dns_records : []
}

output "service_urls" {
  description = "URL internas (*.run.app) de cada servicio."
  value = merge(
    { web = module.web.internal_url, api = module.api.internal_url },
    local.f.realtime ? { realtime = module.realtime[0].internal_url } : {},
    local.f.postgrest ? { postgrest = module.postgrest[0].internal_url } : {},
  )
}

output "identities" {
  description = "Cuentas de servicio del ambiente (y la de despliegue)."
  value       = merge(module.iam.ids, { deployer = google_service_account.deployer.email })
}

output "secret_ids" {
  description = "Clave → secret_id (para cargar valores con gcloud secrets versions add)."
  value       = module.secrets.refs
}

output "buckets" {
  description = "Buckets del ambiente."
  value       = local.f.storage ? module.storage[0].bucket_names : {}
}

output "queues" {
  description = "Colas (Cloud Tasks)."
  value       = module.tasks.queue_names
}

output "scheduler_jobs" {
  description = "Trabajos de Cloud Scheduler."
  value       = module.scheduler.job_ids
}

output "nat_ips" {
  description = "IP fijas de salida (si se pidieron)."
  value       = module.network.nat_ips
}

output "postgres" {
  description = "Cloud SQL: conexión, IP privada y base."
  value = local.f.postgres ? {
    connection_name = module.cloud_sql[0].connection_name
    host            = module.cloud_sql[0].host
    database        = module.cloud_sql[0].database
  } : null
}

output "redis_host" {
  description = "Host de Memorystore."
  value       = local.f.redis ? module.redis[0].host : null
}

output "web_build_env_b64" {
  description = "NEXT_PUBLIC_* del build de la web en base64 (WEB_BUILD_ENV_B64)."
  value       = local.web_build_env_b64
}

output "ci_variables" {
  description = "Variables del entorno de GitHub (Settings › Environments › <ambiente> › Variables) para .github/workflows/deploy.yml."
  value = {
    MIRAI_CLOUD                    = "gcp"
    MIRAI_REGISTRY                 = var.cicd.artifact_registry_path
    MIRAI_SERVICE_WEB              = local.names.web
    MIRAI_SERVICE_API              = local.names.api
    MIRAI_SERVICE_REALTIME         = local.f.realtime ? local.names.realtime : ""
    MIRAI_SERVICE_WORKER           = "" # GCP: Cloud Tasks empuja (sin worker)
    MIRAI_MIGRATE_JOB              = local.f.postgres ? google_cloud_run_v2_job.migrate[0].name : ""
    MIRAI_CANARY_WEB_URL           = local.f.edge && var.cicd.smoke_tests ? "https://${var.domains.canary_web}/api/public/version" : ""
    MIRAI_CANARY_API_URL           = local.f.edge && var.cicd.smoke_tests ? "https://${var.domains.canary_api}/healthz" : ""
    MIRAI_SMOKE_URL                = "https://${var.domains.web}/api/public/version"
    WEB_BUILD_ENV                  = module.app.web_build_env_text
    GCP_PROJECT                    = var.project_id
    GCP_REGION                     = var.region
    GCP_DEPLOY_SERVICE_ACCOUNT     = google_service_account.deployer.email
    GCP_WORKLOAD_IDENTITY_PROVIDER = local.gha == null ? "" : "${local.gha.workload_identity_pool}/providers/github-actions"
    MIRAI_CANARY_STEPS             = var.cicd.canary_steps
    MIRAI_BAKE_SECONDS             = tostring(var.cicd.bake_seconds)
    MIRAI_MAX_5XX_RATIO            = var.cicd.max_5xx_ratio
  }
}
