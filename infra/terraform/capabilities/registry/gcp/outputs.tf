output "registry_url" {
  description = "<región>-docker.pkg.dev/<proyecto>/<repo>."
  value       = module.this.docker_path
}

output "id" {
  description = "ID del repositorio."
  value       = module.this.id
}

output "name" {
  description = "Nombre del repositorio."
  value       = module.this.name
}
