output "host" {
  description = "IP privada de Redis."
  value       = google_redis_instance.this.host
}

output "port" {
  description = "Puerto (6378 con TLS, 6379 sin TLS)."
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

output "url" {
  description = "REDIS_URL para la API y el gateway: redis[s]://:<AUTH>@<host>:<puerto> (va a Secret Manager)."
  value       = "${var.tls ? "rediss" : "redis"}://:${urlencode(google_redis_instance.this.auth_string)}@${google_redis_instance.this.host}:${google_redis_instance.this.port}"
  sensitive   = true
}
