output "name" {
  description = "Nombre del servicio."
  value       = google_cloud_run_v2_service.this.name
}

output "id" {
  description = "ID completo del servicio."
  value       = google_cloud_run_v2_service.this.id
}

output "uri" {
  description = "URL *.run.app (con ingress interno solo responde a tráfico interno y al balanceador)."
  value       = google_cloud_run_v2_service.this.uri
}

output "location" {
  description = "Región del servicio."
  value       = google_cloud_run_v2_service.this.location
}
