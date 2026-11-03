output "cloud_sql_connection_name" {
  description = "proyecto:región:instancia (Cloud SQL Auth Proxy para soporte)."
  value       = local.f.postgres ? module.cloud_sql[0].connection_name : null
}

output "trigger_names" {
  description = "Disparadores de Cloud Build (alternativa)."
  value       = var.cicd.repository_id == null ? {} : module.triggers[0].trigger_names
}

output "identity_platform_issuer" {
  description = "Emisor de Identity Platform (solo con gcp.identity_platform.enabled)."
  value       = var.gcp.identity_platform.enabled ? module.identity_platform[0].issuer : null
}
