output "host" {
  description = "IP privada de Redis."
  value       = google_redis_instance.this.host
}

output "port" {
  description = "Puerto (6378 con TLS)."
  value       = google_redis_instance.this.port
}

output "auth_string" {
  description = "Clave AUTH (se guarda en Secret Manager)."
  value       = google_redis_instance.this.auth_string
  sensitive   = true
}

output "server_ca_pem" {
  description = "CA del servidor para TLS."
  value       = try(google_redis_instance.this.server_ca_certs[0].cert, null)
  sensitive   = true
}
