output "job_names" {
  description = "Clave → nombre del trabajo."
  value       = { for k, j in google_cloud_scheduler_job.this : k => j.name }
}
