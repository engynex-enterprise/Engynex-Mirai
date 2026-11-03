output "network_id" {
  description = "ID de la VPC."
  value       = google_compute_network.this.id
}

output "network_name" {
  description = "Nombre de la VPC."
  value       = google_compute_network.this.name
}

output "network_self_link" {
  description = "self_link de la VPC (lo piden Cloud SQL y Memorystore)."
  value       = google_compute_network.this.self_link
}

output "subnet_id" {
  description = "ID de la subred de Cloud Run."
  value       = google_compute_subnetwork.run.id
}

output "subnet_name" {
  description = "Nombre de la subred de Cloud Run."
  value       = google_compute_subnetwork.run.name
}

output "private_services_range_name" {
  description = "Nombre del rango de Private Services Access (null si está apagado)."
  value       = var.enable_private_services ? google_compute_global_address.private_services[0].name : null
}

output "private_services_connection_id" {
  description = "ID de la conexión de Private Services Access (para depends_on)."
  value       = var.enable_private_services ? google_service_networking_connection.private_services[0].id : null
}

output "nat_ips" {
  description = "IP fijas de salida (vacío si son automáticas). Son las que se dan a una integración con lista blanca."
  value       = google_compute_address.nat[*].address
}
