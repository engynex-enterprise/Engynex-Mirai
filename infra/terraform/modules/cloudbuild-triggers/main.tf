# Disparadores de Cloud Build de un ambiente (push a su rama). Corren con la cuenta de despliegue del ambiente,
# que solo tiene permisos en ese proyecto (pruebas no puede tocar producción).

resource "google_cloudbuild_trigger" "this" {
  for_each           = var.triggers
  project            = var.project_id
  location           = var.location
  name               = "${var.prefix}-${each.key}"
  description        = each.value.description
  filename           = each.value.filename
  included_files     = each.value.included_files
  ignored_files      = each.value.ignored_files
  substitutions      = each.value.substitutions
  disabled           = each.value.disabled
  service_account    = var.service_account_id
  include_build_logs = "INCLUDE_BUILD_LOGS_WITH_STATUS"

  repository_event_config {
    repository = var.repository_id
    push {
      branch = var.branch_regex
    }
  }

  approval_config {
    approval_required = var.approval_required
  }
}
