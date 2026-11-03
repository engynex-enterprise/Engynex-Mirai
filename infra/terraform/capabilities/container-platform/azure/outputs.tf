output "platform" {
  description = "Handle de la plataforma (Azure): entorno de Container Apps, dominio, Log Analytics, ubicación y grupo."
  value = {
    id                         = azurerm_container_app_environment.this.id
    name                       = azurerm_container_app_environment.this.name
    default_domain             = azurerm_container_app_environment.this.default_domain
    static_ip                  = azurerm_container_app_environment.this.static_ip_address
    internal                   = local.internal
    log_analytics_workspace_id = azurerm_log_analytics_workspace.this.id
    location                   = var.context.region
    resource_group_name        = local.rg
  }
}

output "id" {
  description = "ID del entorno de Container Apps."
  value       = azurerm_container_app_environment.this.id
}

output "internal_domain" {
  description = "Dominio del entorno: <app>.<dominio> (externo) y <app>.internal.<dominio> (dentro del entorno)."
  value       = azurerm_container_app_environment.this.default_domain
}
