output "service_id" {
  description = "ID completo del servicio de Cloud Run."
  value       = module.this.id
}

output "name" {
  description = "Nombre del servicio."
  value       = module.this.name
}

output "internal_url" {
  description = "URL *.run.app (con ingress interno solo responde a tráfico interno y al balanceador)."
  value       = module.this.uri
}

output "public_url" {
  description = "La misma URL *.run.app (pública solo con ingress = public)."
  value       = module.this.uri
}

output "edge_origin" {
  description = "Handle para el balanceador: servicio, región y etiqueta de revisión (null = la que tiene tráfico)."
  value       = { service = module.this.name, region = var.platform.region, tag = null }
}
