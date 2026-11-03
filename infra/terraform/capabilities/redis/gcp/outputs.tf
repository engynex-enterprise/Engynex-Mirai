output "id" {
  description = "projects/<p>/locations/<r>/instances/<n> (lo usan las alertas)."
  value       = "projects/${var.context.cloud.project_id}/locations/${var.context.region}/instances/${var.name}"
}

output "host" {
  description = "IP privada."
  value       = module.this.host
}

output "port" {
  description = "Puerto (6378 con TLS, 6379 sin TLS)."
  value       = module.this.port
}

output "url" {
  description = "REDIS_URL (va al almacén de secretos)."
  value       = module.this.url
  sensitive   = true
}
