output "zone_id" {
  description = "ID de la zona."
  value       = var.create_zone ? azurerm_dns_zone.this[0].id : data.azurerm_dns_zone.this[0].id
}

output "name_servers" {
  description = "Servidores de nombres (registros NS que se ponen en Hostinger para delegar la zona)."
  value       = var.create_zone ? azurerm_dns_zone.this[0].name_servers : data.azurerm_dns_zone.this[0].name_servers
}
