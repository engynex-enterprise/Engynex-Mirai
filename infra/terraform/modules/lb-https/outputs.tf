output "ipv4" {
  description = "IP pública del balanceador (registros A)."
  value       = google_compute_global_address.v4.address
}

output "ipv6" {
  description = "IPv6 del balanceador (registros AAAA), si se activó."
  value       = var.enable_ipv6 ? google_compute_global_address.v6[0].address : null
}

output "dns_records" {
  description = "Registros DNS que hay que crear en Hostinger: A por dominio y CNAME de autorización del certificado."
  value = concat(
    [for h in keys(var.host_rules) : { name = h, type = "A", data = google_compute_global_address.v4.address }],
    var.enable_ipv6 ? [for h in keys(var.host_rules) : { name = h, type = "AAAA", data = google_compute_global_address.v6[0].address }] : [],
    flatten([for d in google_certificate_manager_dns_authorization.this : [
      for r in d.dns_resource_record : { name = r.name, type = r.type, data = r.data }
    ]]),
  )
}

output "security_policy_id" {
  description = "ID de la política de Cloud Armor."
  value       = google_compute_security_policy.this.id
}

output "backend_service_names" {
  description = "Clave → nombre del backend service (para métricas y registros)."
  value       = { for k, b in google_compute_backend_service.run : k => b.name }
}

output "url_map_name" {
  description = "Nombre del URL map HTTPS (métricas del balanceador)."
  value       = google_compute_url_map.https.name
}
