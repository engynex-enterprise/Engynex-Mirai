# Identity Platform: adaptador OPCIONAL (gcp.identity_platform.enabled, §3.1.9). La identidad principal es Better Auth en la
# API sobre Cloud SQL (D1). El secreto de OAuth sale de Secret Manager (debe tener valor).

data "google_secret_manager_secret_version" "google_client_secret" {
  count   = var.gcp.identity_platform.enabled && var.gcp.identity_platform.google_client_id != null ? 1 : 0
  project = var.project_id
  secret  = module.secrets.refs["google-client-secret"]
}

module "identity_platform" {
  count              = var.gcp.identity_platform.enabled ? 1 : 0
  source             = "../../../modules/identity-platform"
  project_id         = var.project_id
  authorized_domains = [var.domains.web, var.domains.canary_web, "localhost"]
  google_client_id   = var.gcp.identity_platform.google_client_id
  google_client_secret = (
    var.gcp.identity_platform.google_client_id != null ? data.google_secret_manager_secret_version.google_client_secret[0].secret_data : null
  )
  totp_mfa = var.gcp.identity_platform.totp_mfa
}
