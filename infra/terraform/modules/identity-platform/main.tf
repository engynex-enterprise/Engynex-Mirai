# Google Identity Platform (etapa 4: reemplaza Supabase Auth). Queda preparado: correo + contraseña, enlace mágico
# (password_required = false permite ambos), Google y TOTP. Los usuarios se importan con hash BCRYPT conservando el
# UUID de Supabase como localId (docs/arquitectura/v6-separacion-front-back.md §5.1). Plantillas de correo y SMTP
# propio se configuran en la consola (no hay recurso de Terraform; ver runbook).

resource "google_identity_platform_config" "this" {
  project                    = var.project_id
  authorized_domains         = var.authorized_domains
  autodelete_anonymous_users = true

  sign_in {
    allow_duplicate_emails = false

    email {
      enabled           = true
      password_required = false
    }

    anonymous {
      enabled = false
    }

    phone_number {
      enabled = false
    }
  }

  dynamic "mfa" {
    for_each = var.totp_mfa ? [1] : []
    content {
      state = "ENABLED"
      provider_configs {
        state = "ENABLED"
        totp_provider_config {
          adjacent_intervals = 1
        }
      }
    }
  }

  sms_region_config {
    allowlist_only {
      allowed_regions = var.sms_allowed_regions
    }
  }

  monitoring {
    request_logging {
      enabled = true
    }
  }
}

resource "google_identity_platform_default_supported_idp_config" "google" {
  count         = var.google_client_id == null ? 0 : 1
  project       = var.project_id
  idp_id        = "google.com"
  enabled       = true
  client_id     = var.google_client_id
  client_secret = var.google_client_secret

  depends_on = [google_identity_platform_config.this]
}
