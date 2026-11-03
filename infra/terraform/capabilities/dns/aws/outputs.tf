output "zone_id" {
  description = "ID de la zona de Route 53."
  value       = local.zone_id
}

output "name_servers" {
  description = "Servidores de nombres (NS que se ponen en Hostinger para delegar la zona)."
  value       = local.name_servers
}
