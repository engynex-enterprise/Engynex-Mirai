output "registry_url" {
  description = "Ruta base de las imágenes: <login_server>/<name>."
  value       = "${azurerm_container_registry.this.login_server}/${var.name}"
}

output "id" {
  description = "ID del registro."
  value       = azurerm_container_registry.this.id
}

output "name" {
  description = "Nombre del registro (az acr login --name)."
  value       = azurerm_container_registry.this.name
}
