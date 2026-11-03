output "refs" {
  description = "Clave → URL del secreto sin versión (key_vault_secret_id de Container Apps: siempre la última versión)."
  value       = local.versionless
}

output "ids" {
  description = "Clave → ID de recurso del secreto (alcance de las asignaciones de rol)."
  value       = local.resource_ids
}
