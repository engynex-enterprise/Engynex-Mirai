output "state_bucket" {
  description = "Bucket del estado remoto (va en backend.hcl de cada ambiente)."
  value       = google_storage_bucket.state.name
}

output "project_numbers" {
  description = "Número de cada proyecto."
  value       = { for k, p in data.google_project.this : k => p.number }
}

output "artifact_registry_path" {
  description = "Ruta base de las imágenes (cicd.artifact_registry_path de los ambientes)."
  value       = module.artifact_registry.registry_url
}

output "artifact_registry_repo" {
  description = "Nombre del repositorio (cicd.artifact_registry_repo de los ambientes)."
  value       = module.artifact_registry.name
}

output "workload_identity_provider" {
  description = "Valor de workload_identity_provider para google-github-actions/auth."
  value       = module.wif.provider_id
}

output "terraform_service_accounts" {
  description = "Cuentas que usa GitHub Actions (plan y apply por ambiente)."
  value       = module.wif.ids
}

output "cloudbuild_repository_id" {
  description = "ID del repositorio vinculado (cicd.repository_id de los ambientes). null hasta conectar GitHub."
  value       = local.github_connection ? google_cloudbuildv2_repository.mirai[0].id : null
}

output "workload_identity_pool" {
  description = "Pool de WIF (variable workload_identity_pool de pruebas y produccion: GitHub Actions despliega con la cuenta de cada ambiente)."
  value       = regex("^(.*)/providers/[^/]+$", module.wif.provider_id)[0]
}
