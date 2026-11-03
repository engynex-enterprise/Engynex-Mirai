output "job_ids" {
  description = "Clave → nombre del trabajo de Cloud Scheduler."
  value       = module.this.job_names
}
