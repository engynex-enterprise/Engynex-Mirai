output "edge_address" {
  description = "Host de Front Door (destino de los CNAME)."
  value       = module.mirai.edge_address
}

output "dns_records" {
  description = "Registros DNS a crear en Hostinger."
  value       = module.mirai.dns_records
}

output "service_urls" {
  description = "URL internas de los servicios."
  value       = module.mirai.service_urls
}

output "identities" {
  description = "Identidades administradas."
  value       = module.mirai.identities
}

output "secret_ids" {
  description = "Secretos de Key Vault a los que hay que cargar valor."
  value       = module.mirai.secret_ids
}

output "buckets" {
  description = "Cuentas de almacenamiento."
  value       = module.mirai.buckets
}

output "queues" {
  description = "Colas."
  value       = module.mirai.queues
}

output "scheduler_jobs" {
  description = "Trabajos del cron."
  value       = module.mirai.scheduler_jobs
}

output "nat_ips" {
  description = "IP fijas de salida."
  value       = module.mirai.nat_ips
}

output "postgres" {
  description = "Servidor de Postgres."
  value       = module.mirai.postgres
}

output "redis_host" {
  description = "Host de Redis."
  value       = module.mirai.redis_host
}

output "ci_variables" {
  description = "Variables del entorno de GitHub."
  value       = module.mirai.ci_variables
}
