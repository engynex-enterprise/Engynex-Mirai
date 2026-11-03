# Secret Manager con el catálogo común (capabilities/app-config/secrets.tf). Los valores se cargan con
# `gcloud secrets versions add` (docs/infra/runbook.md §2.3) salvo los que genera la infraestructura: URL de la base
# y de Redis, BETTER_AUTH_SECRET y el secreto del JWT interno de PostgREST.

resource "random_password" "better_auth" {
  count   = var.auth_provider == "mirai" ? 1 : 0
  length  = 48
  special = false
}

resource "random_password" "postgrest_jwt" {
  count   = local.f.postgrest ? 1 : 0
  length  = 48
  special = false
}

locals {
  generated_secrets = merge(
    local.f.redis ? { "redis-url" = module.redis[0].url } : {},
    local.f.postgres ? {
      "database-url"       = module.cloud_sql[0].connection_urls["app"]
      "database-admin-url" = module.cloud_sql[0].admin_url
    } : {},
    local.f.postgres && local.f.postgrest ? { "postgrest-db-uri" = module.cloud_sql[0].connection_urls["postgrest"] } : {},
    var.auth_provider == "mirai" ? { "better-auth-secret" = random_password.better_auth[0].result } : {},
    local.f.postgrest ? { "postgrest-jwt-secret" = random_password.postgrest_jwt[0].result } : {},
  )
}

module "secrets" {
  source  = "../../../capabilities/secrets/gcp"
  context = local.context

  secrets = {
    for k, s in module.app.secret_catalog : k => {
      description = s.description
      accessors = {
        for svc in module.app.secret_readers[k] : local.service_identity[svc] => module.iam.principals[local.service_identity[svc]]
        if contains(keys(local.service_identity), svc) && contains(keys(local.identities), lookup(local.service_identity, svc, ""))
      }
    }
  }

  generated_values = local.generated_secrets
}
