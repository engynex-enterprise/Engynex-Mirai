output "platform" {
  description = "Handle de la plataforma (GCP): proyecto, región, red y etiquetas de red."
  value       = local.platform
}

output "id" {
  description = "projects/<proyecto>/locations/<región>."
  value       = "projects/${var.context.cloud.project_id}/locations/${var.context.region}"
}

output "internal_domain" {
  description = "Dominio de las URL internas (Cloud Run: run.app)."
  value       = "run.app"
}
