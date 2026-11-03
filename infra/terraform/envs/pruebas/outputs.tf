output "lb_ipv4" {
  description = "IP pública del balanceador."
  value       = module.mirai.lb_ipv4
}

output "dns_records" {
  description = "Registros DNS a crear en Hostinger."
  value       = module.mirai.dns_records
}

output "run_urls" {
  description = "URL *.run.app de los servicios."
  value       = module.mirai.run_urls
}

output "service_accounts" {
  description = "Cuentas de servicio."
  value       = module.mirai.service_accounts
}

output "secret_ids" {
  description = "Secretos a los que hay que cargar valor."
  value       = module.mirai.secret_ids
}

output "buckets" {
  description = "Buckets."
  value       = module.mirai.buckets
}

output "task_queues" {
  description = "Colas de Cloud Tasks."
  value       = module.mirai.task_queues
}

output "scheduler_jobs" {
  description = "Trabajos de Cloud Scheduler."
  value       = module.mirai.scheduler_jobs
}

output "nat_ips" {
  description = "IP fijas de salida."
  value       = module.mirai.nat_ips
}

output "cloud_sql_connection_name" {
  description = "Conexión de Cloud SQL."
  value       = module.mirai.cloud_sql_connection_name
}

output "redis_host" {
  description = "Host de Redis."
  value       = module.mirai.redis_host
}

output "trigger_names" {
  description = "Disparadores de Cloud Build."
  value       = module.mirai.trigger_names
}
