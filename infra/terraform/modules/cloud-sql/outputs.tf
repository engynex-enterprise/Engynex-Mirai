output "instance_name" {
  description = "Nombre de la instancia."
  value       = google_sql_database_instance.this.name
}

output "connection_name" {
  description = "proyecto:región:instancia (lo usa el Cloud SQL Node.js Connector)."
  value       = google_sql_database_instance.this.connection_name
}

output "private_ip" {
  description = "IP privada de la instancia."
  value       = google_sql_database_instance.this.private_ip_address
}

output "database_name" {
  description = "Base de datos de la aplicación."
  value       = google_sql_database.app.name
}

output "iam_db_users" {
  description = "Clave → usuario de base de datos IAM de cada cuenta de servicio."
  value       = { for k, u in google_sql_user.service_accounts : k => u.name }
}
