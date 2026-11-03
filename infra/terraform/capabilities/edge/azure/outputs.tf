output "id" {
  description = "ID del perfil de Front Door."
  value       = azurerm_cdn_frontdoor_profile.this.id
}

output "ip_or_cname" {
  description = "Host del endpoint (<nombre>-<hash>.z01.azurefd.net): destino de los CNAME."
  value       = azurerm_cdn_frontdoor_endpoint.this.host_name
}

output "dns_records" {
  description = "Registros que hay que crear en el DNS (Hostinger): TXT _dnsauth primero (valida el certificado), CNAME al hacer el corte."
  value = concat(
    [for h, d in azurerm_cdn_frontdoor_custom_domain.this : { name = "_dnsauth.${h}", type = "TXT", data = d.validation_token }],
    [for h in keys(var.hosts) : { name = h, type = "CNAME", data = azurerm_cdn_frontdoor_endpoint.this.host_name }],
  )
}

output "security_policy_id" {
  description = "ID de la política de WAF."
  value       = azurerm_cdn_frontdoor_firewall_policy.this.id
}
