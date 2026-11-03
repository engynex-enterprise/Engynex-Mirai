output "state_resource_group" {
  description = "Grupo del estado (resource_group_name de backend.hcl)."
  value       = azurerm_resource_group.cicd.name
}

output "state_storage_account" {
  description = "Cuenta del estado (storage_account_name de backend.hcl)."
  value       = azurerm_storage_account.state.name
}

output "environment_resource_groups" {
  description = "Grupo de recursos de cada ambiente (resource_group_name de clouds/azure/envs/<ambiente>)."
  value       = { for k, g in azurerm_resource_group.env : k => g.name }
}

output "registry_server" {
  description = "Login server del ACR (registry_server de los ambientes)."
  value       = split("/", module.registry.registry_url)[0]
}

output "registry_id" {
  description = "ID del ACR (registry_id de los ambientes)."
  value       = module.registry.id
}

output "registry_url" {
  description = "Ruta base de las imágenes (MIRAI_REGISTRY)."
  value       = module.registry.registry_url
}

output "github" {
  description = "Variables de GitHub para azure/login: AZURE_TENANT_ID, AZURE_SUBSCRIPTION_ID y el AZURE_CLIENT_ID de cada identidad."
  value = {
    AZURE_TENANT_ID       = module.ci.provider_id
    AZURE_SUBSCRIPTION_ID = var.subscription_id
    client_ids            = module.ci.ids
  }
}
