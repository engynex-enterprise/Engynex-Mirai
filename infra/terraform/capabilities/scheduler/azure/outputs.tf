output "job_ids" {
  description = "Clave → ID del Container Apps Job."
  value       = { for k, j in azurerm_container_app_job.this : k => j.id }
}
