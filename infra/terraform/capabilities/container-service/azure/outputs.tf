output "service_id" {
  description = "ID de la Container App."
  value       = azurerm_container_app.this.id
}

output "name" {
  description = "Nombre de la Container App."
  value       = azurerm_container_app.this.name
}

output "internal_url" {
  description = "URL dentro del entorno (https://<app>.internal.<dominio>); null sin ingress."
  value       = local.no_ingress ? null : "https://${var.name}.internal.${var.platform.default_domain}"
}

output "public_url" {
  description = "URL pública del ingress externo (la usa Front Door como origen); null si es interno."
  value       = local.no_ingress || var.ingress == "internal" ? null : "https://${var.name}.${var.platform.default_domain}"
}

output "edge_origin" {
  description = "Handle para el borde: host del ingress, id de la app y del entorno, camino de salud y afinidad."
  value = {
    host             = "${var.name}.${var.platform.default_domain}"
    app_id           = azurerm_container_app.this.id
    environment_id   = var.platform.id
    location         = var.context.region
    health_path      = var.health_path
    session_affinity = var.session_affinity
  }
}
