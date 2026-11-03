output "state_bucket" {
  description = "Bucket del estado remoto (va en backend.hcl de cada ambiente)."
  value       = aws_s3_bucket.state.bucket
}

output "registry_url" {
  description = "Ruta base de las imágenes (variable registry_url de los ambientes y MIRAI_REGISTRY de GitHub)."
  value       = module.registry.registry_url
}

output "github_oidc_provider_arn" {
  description = "Proveedor OIDC de GitHub."
  value       = module.ci.provider_id
}

output "roles" {
  description = "Roles para aws-actions/configure-aws-credentials (role-to-assume): plan, apply y despliegue por ambiente."
  value       = module.ci.ids
}
