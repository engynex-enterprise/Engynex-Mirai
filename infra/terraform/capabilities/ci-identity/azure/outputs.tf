output "provider_id" {
  description = "Tenant de Entra ID (AZURE_TENANT_ID de azure/login)."
  value       = var.context.cloud["tenant_id"]
}

output "principals" {
  description = "Clave → object_id de la entidad de servicio (para asignar roles)."
  value       = { for k, sp in azuread_service_principal.this : k => sp.object_id }
}

output "ids" {
  description = "Clave → client_id (AZURE_CLIENT_ID de azure/login)."
  value       = { for k, a in azuread_application.this : k => a.client_id }
}
