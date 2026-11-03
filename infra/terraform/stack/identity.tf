# Etapa 4: Identity Platform reemplaza Supabase Auth. El secreto de OAuth sale de Secret Manager (debe tener valor).

data "google_secret_manager_secret_version" "google_client_secret" {
  count   = var.stages.identity_platform && var.identity_platform.google_client_id != null ? 1 : 0
  project = var.project_id
  secret  = module.secrets.secret_ids["google-client-secret"]
}

module "identity_platform" {
  count              = var.stages.identity_platform ? 1 : 0
  source             = "../modules/identity-platform"
  project_id         = var.project_id
  authorized_domains = [var.domains.web, var.domains.canary_web, "localhost"]
  google_client_id   = var.identity_platform.google_client_id
  google_client_secret = (
    var.identity_platform.google_client_id != null ? data.google_secret_manager_secret_version.google_client_secret[0].secret_data : null
  )
  totp_mfa = var.identity_platform.totp_mfa
}
