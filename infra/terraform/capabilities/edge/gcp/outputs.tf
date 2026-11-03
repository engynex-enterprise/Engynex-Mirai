output "id" {
  description = "Nombre del URL map HTTPS."
  value       = module.this.url_map_name
}

output "ip_or_cname" {
  description = "IP pública del balanceador (registros A)."
  value       = module.this.ipv4
}

output "dns_records" {
  description = "Registros para Hostinger: A por dominio y CNAME _acme-challenge del certificado."
  value       = module.this.dns_records
}

output "security_policy_id" {
  description = "Política de Cloud Armor."
  value       = module.this.security_policy_id
}
