output "instance_id" {
  description = "ID del Flexible Server."
  value       = azurerm_postgresql_flexible_server.this.id
}

output "host" {
  description = "FQDN privado del servidor."
  value       = local.host
}

output "port" {
  description = "Puerto."
  value       = 5432
}

output "database" {
  description = "Base de datos de la aplicación."
  value       = azurerm_postgresql_flexible_server_database.app.name
}

output "connection_name" {
  description = "host:puerto (en Azure no hay conector propio)."
  value       = "${local.host}:5432"
}

output "connection_urls" {
  description = "Clave de app_users → postgres://rol:clave@host:5432/base?sslmode=require (va al almacén de secretos)."
  value       = local.urls
  sensitive   = true
}

output "admin_url" {
  description = "URL del administrador del servidor (crea los roles de la línea base)."
  value       = "postgres://${local.admin_user}:${random_password.admin.result}@${local.host}:5432/${var.database_name}?sslmode=require"
  sensitive   = true
}

output "iam_users" {
  description = "Usuarios IAM (Azure: ninguno; ver main.tf)."
  value       = {}
}
