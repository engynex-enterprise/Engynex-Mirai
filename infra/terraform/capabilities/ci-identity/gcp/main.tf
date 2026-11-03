# ci-identity (GCP): Workload Identity Federation para GitHub Actions (envuelve modules/workload-identity-github).
# Cada clave de roles es una cuenta de servicio (account_id = clave). pull_requests no aplica: sin refs ni
# environments la cuenta vale para todo el repositorio (solo para lectura). cloud_options: pool_id, provider_id.

module "this" {
  source               = "../../../modules/workload-identity-github"
  project_id           = var.context.cloud.project_id
  pool_id              = try(var.cloud_options.pool_id, "github")
  provider_id          = try(var.cloud_options.provider_id, "github-actions")
  github_owner         = var.github.owner
  github_repository    = var.github.repository
  github_repository_id = var.github.repository_id

  service_accounts = {
    for k, r in var.roles : k => { display_name = r.display_name, refs = r.refs, environments = r.environments }
  }
}
