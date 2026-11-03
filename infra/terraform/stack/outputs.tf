output "lb_ipv4" {
  description = "IP pública del balanceador."
  value       = var.stages.load_balancer ? module.lb[0].ipv4 : null
}

output "dns_records" {
  description = "Registros que hay que crear en el DNS (Hostinger): CNAME _acme-challenge primero, A al hacer el corte."
  value       = var.stages.load_balancer ? module.lb[0].dns_records : []
}

output "run_urls" {
  description = "URL *.run.app de cada servicio (internas si hay balanceador)."
  value = merge(
    { web = module.web.uri, api = module.api.uri },
    var.stages.realtime ? { realtime = module.realtime[0].uri } : {},
  )
}

output "service_accounts" {
  description = "Cuentas de servicio del ambiente."
  value       = merge(module.iam.emails, { deployer = google_service_account.deployer.email })
}

output "secret_ids" {
  description = "Nombre corto → secret_id (para cargar valores con gcloud secrets versions add)."
  value       = module.secrets.secret_ids
}

output "buckets" {
  description = "Buckets del ambiente."
  value       = var.stages.storage ? module.storage[0].names : {}
}

output "task_queues" {
  description = "Colas de Cloud Tasks."
  value       = module.tasks.queue_names
}

output "scheduler_jobs" {
  description = "Trabajos de Cloud Scheduler."
  value       = module.scheduler.job_names
}

output "nat_ips" {
  description = "IP fijas de salida (si se pidieron)."
  value       = module.network.nat_ips
}

output "cloud_sql_connection_name" {
  description = "Conexión de Cloud SQL (etapa 3)."
  value       = var.stages.cloud_sql ? module.cloud_sql[0].connection_name : null
}

output "redis_host" {
  description = "Host de Memorystore (etapa 3)."
  value       = var.stages.redis ? module.redis[0].host : null
}

output "trigger_names" {
  description = "Disparadores de Cloud Build."
  value       = var.cicd.repository_id == null ? {} : module.triggers[0].trigger_names
}

output "identity_platform_issuer" {
  description = "Emisor de tokens de Identity Platform (etapa 4)."
  value       = var.stages.identity_platform ? module.identity_platform[0].issuer : null
}
