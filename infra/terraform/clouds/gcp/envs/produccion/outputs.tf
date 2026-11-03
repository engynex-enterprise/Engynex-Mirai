output "edge_address" {
  description = "IP pública del balanceador."
  value       = module.mirai.edge_address
}

output "dns_records" {
  description = "Registros DNS a crear en Hostinger."
  value       = module.mirai.dns_records
}

output "service_urls" {
  description = "URL *.run.app de los servicios."
  value       = module.mirai.service_urls
}

output "identities" {
  description = "Cuentas de servicio."
  value       = module.mirai.identities
}

output "secret_ids" {
  description = "Secretos a los que hay que cargar valor."
  value       = module.mirai.secret_ids
}

output "buckets" {
  description = "Buckets."
  value       = module.mirai.buckets
}

output "queues" {
  description = "Colas de Cloud Tasks."
  value       = module.mirai.queues
}

output "scheduler_jobs" {
  description = "Trabajos de Cloud Scheduler."
  value       = module.mirai.scheduler_jobs
}

output "nat_ips" {
  description = "IP fijas de salida."
  value       = module.mirai.nat_ips
}

output "postgres" {
  description = "Cloud SQL."
  value       = module.mirai.postgres
}

output "redis_host" {
  description = "Host de Redis."
  value       = module.mirai.redis_host
}

output "web_build_env_b64" {
  description = "NEXT_PUBLIC_* del build de la web."
  value       = module.mirai.web_build_env_b64
}

output "ci_variables" {
  description = "Variables del entorno de GitHub para deploy.yml (gh variable set … --env produccion)."
  value       = module.mirai.ci_variables
}

output "trigger_names" {
  description = "Disparadores de Cloud Build (alternativa)."
  value       = module.mirai.trigger_names
}
