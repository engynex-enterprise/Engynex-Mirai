output "zone_id" {
  description = "Nombre de la zona administrada."
  value       = local.zone.name
}

output "name_servers" {
  description = "Servidores de nombres (se delegan con NS en Hostinger)."
  value       = local.zone.name_servers
}
