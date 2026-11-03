output "id" {
  description = "ID de la instancia."
  value       = azurerm_redis_cache.this.id
}

output "host" {
  description = "Nombre del host (resuelve a la IP privada por la zona DNS privada)."
  value       = azurerm_redis_cache.this.hostname
}

output "port" {
  description = "Puerto TLS."
  value       = azurerm_redis_cache.this.ssl_port
}

output "url" {
  description = "REDIS_URL: rediss://:<clave>@<host>:6380 (va al almacén de secretos)."
  value       = "rediss://:${urlencode(azurerm_redis_cache.this.primary_access_key)}@${azurerm_redis_cache.this.hostname}:${azurerm_redis_cache.this.ssl_port}"
  sensitive   = true
}
