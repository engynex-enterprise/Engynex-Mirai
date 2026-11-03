output "edge_address" {
  description = "Dominio de CloudFront (CNAME de cada dominio)."
  value       = module.mirai.edge_address
}

output "dns_records" {
  description = "Registros DNS a crear en Hostinger (validación de ACM primero)."
  value       = module.mirai.dns_records
}

output "service_urls" {
  description = "URL internas de los servicios (Service Connect)."
  value       = module.mirai.service_urls
}

output "identities" {
  description = "Roles de IAM de cada servicio."
  value       = module.mirai.identities
}

output "secret_ids" {
  description = "Secretos a los que hay que cargar valor (aws secretsmanager put-secret-value)."
  value       = module.mirai.secret_ids
}

output "buckets" {
  description = "Buckets de S3."
  value       = module.mirai.buckets
}

output "queues" {
  description = "Colas de SQS."
  value       = module.mirai.queues
}

output "scheduler_jobs" {
  description = "Programaciones de EventBridge Scheduler."
  value       = module.mirai.scheduler_jobs
}

output "nat_ips" {
  description = "IP fijas de salida."
  value       = module.mirai.nat_ips
}

output "postgres" {
  description = "RDS (sin contraseñas)."
  value       = module.mirai.postgres
}

output "redis_host" {
  description = "Endpoint de ElastiCache."
  value       = module.mirai.redis_host
}

output "ci_variables" {
  description = "Variables del entorno de GitHub para infra/deploy/aws y los flujos de despliegue."
  value       = module.mirai.ci_variables
}
