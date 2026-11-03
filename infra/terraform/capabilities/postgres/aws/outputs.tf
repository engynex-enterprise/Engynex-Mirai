output "instance_id" {
  description = "Identificador de la instancia de RDS."
  value       = aws_db_instance.this.identifier
}

output "host" {
  description = "Dirección privada de la instancia."
  value       = aws_db_instance.this.address
}

output "port" {
  description = "Puerto (5432)."
  value       = aws_db_instance.this.port
}

output "database" {
  description = "Base de datos de la aplicación."
  value       = var.database_name
}

output "connection_name" {
  description = "host:puerto."
  value       = "${aws_db_instance.this.address}:${aws_db_instance.this.port}"
}

output "connection_urls" {
  description = "Clave de app_users → URL con contraseña (TLS). Van al almacén de secretos."
  value       = local.urls
  sensitive   = true
}

output "admin_url" {
  description = "URL del administrador (solo el trabajo db-migrate)."
  value       = "postgres://${local.admin}:${random_password.admin.result}@${local.host}:${local.port}/${var.database_name}?sslmode=require"
  sensitive   = true
}

output "iam_users" {
  description = "En AWS no hay usuarios IAM de base (se devuelve lo pedido, sin crear nada)."
  value       = {}
}
