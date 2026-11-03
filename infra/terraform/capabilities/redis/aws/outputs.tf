output "id" {
  description = "ID del grupo de replicación (conocido al planear: lo usan las alarmas)."
  value       = local.id
}

output "host" {
  description = "Endpoint primario (privado)."
  value       = aws_elasticache_replication_group.this.primary_endpoint_address
}

output "port" {
  description = "Puerto (6379, con TLS)."
  value       = aws_elasticache_replication_group.this.port
}

output "url" {
  description = "REDIS_URL: rediss://:<AUTH>@<host>:6379 (va al almacén de secretos)."
  value       = "rediss://:${random_password.auth.result}@${aws_elasticache_replication_group.this.primary_endpoint_address}:6379"
  sensitive   = true
}
