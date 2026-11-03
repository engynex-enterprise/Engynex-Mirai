# Workload Identity Federation para GitHub Actions: sin llaves JSON. GitHub presenta su token OIDC y Google lo
# cambia por credenciales de corta vida de una cuenta de servicio, solo para este repositorio.

locals {
  repo = "${var.github_owner}/${var.github_repository}"

  condition = var.github_repository_id == null ? "assertion.repository == '${local.repo}'" : "assertion.repository == '${local.repo}' && assertion.repository_id == '${var.github_repository_id}'"

  pool_name = google_iam_workload_identity_pool.this.name

  # Una vinculación por cuenta y por ref/entorno permitido (o por todo el repositorio si no se restringe).
  bindings = merge([
    for sa, cfg in var.service_accounts : merge(
      length(cfg.refs) + length(cfg.environments) == 0 ? {
        "${sa}/repo" = { sa = sa, member = "principalSet://iam.googleapis.com/${local.pool_name}/attribute.repository/${local.repo}" }
      } : {},
      { for r in cfg.refs : "${sa}/ref/${r}" => { sa = sa, member = "principalSet://iam.googleapis.com/${local.pool_name}/attribute.ref/${r}" } },
      { for e in cfg.environments : "${sa}/env/${e}" => { sa = sa, member = "principalSet://iam.googleapis.com/${local.pool_name}/attribute.environment/${e}" } },
    )
  ]...)
}

resource "google_iam_workload_identity_pool" "this" {
  project                   = var.project_id
  workload_identity_pool_id = var.pool_id
  display_name              = "GitHub (Mirai)"
  description               = "Identidades de GitHub Actions para ${local.repo}."
}

resource "google_iam_workload_identity_pool_provider" "github" {
  project                            = var.project_id
  workload_identity_pool_id          = google_iam_workload_identity_pool.this.workload_identity_pool_id
  workload_identity_pool_provider_id = var.provider_id
  display_name                       = "GitHub Actions"
  attribute_condition                = local.condition

  attribute_mapping = {
    "google.subject"             = "assertion.sub"
    "attribute.repository"       = "assertion.repository"
    "attribute.repository_owner" = "assertion.repository_owner"
    "attribute.ref"              = "assertion.ref"
    "attribute.environment"      = "assertion.environment"
    "attribute.actor"            = "assertion.actor"
  }

  oidc {
    issuer_uri = "https://token.actions.githubusercontent.com"
  }
}

resource "google_service_account" "this" {
  for_each     = var.service_accounts
  project      = var.project_id
  account_id   = each.key
  display_name = each.value.display_name
}

resource "google_service_account_iam_member" "wif" {
  for_each           = local.bindings
  service_account_id = google_service_account.this[each.value.sa].name
  role               = "roles/iam.workloadIdentityUser"
  member             = each.value.member
}
