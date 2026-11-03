output "instance_id" {
  description = "Nombre de la instancia (lo usan las alertas)."
  value       = module.this.instance_name
}

output "host" {
  description = "IP privada."
  value       = module.this.private_ip
}

output "port" {
  description = "Puerto."
  value       = 5432
}

output "database" {
  description = "Base de la aplicación."
  value       = module.this.database_name
}

output "connection_name" {
  description = "proyecto:región:instancia (Cloud SQL Connector y Auth Proxy)."
  value       = module.this.connection_name
}

output "connection_urls" {
  description = "Clave de app_users → URL postgresql:// con TLS (va al almacén de secretos)."
  value       = { for k, v in local.urls : k => v if k != "admin" }
  sensitive   = true
}

output "admin_url" {
  description = "URL del administrador mirai_admin (cloudsqlsuperuser): migraciones y línea base."
  value       = local.urls["admin"]
  sensitive   = true
}

output "iam_users" {
  description = "Clave → usuario IAM de cada cuenta de servicio."
  value       = module.this.iam_db_users
}
