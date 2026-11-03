output "id" {
  description = "ID del repositorio."
  value       = google_artifact_registry_repository.this.id
}

output "name" {
  description = "Nombre corto del repositorio."
  value       = google_artifact_registry_repository.this.name
}

output "docker_path" {
  description = "Ruta base de las imágenes: <región>-docker.pkg.dev/<proyecto>/<repo>."
  value       = "${var.location}-docker.pkg.dev/${var.project_id}/${google_artifact_registry_repository.this.repository_id}"
}
