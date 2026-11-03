# Secret Manager: un secreto por variable sensible. Terraform crea el contenedor y los permisos;
# los valores se cargan con `gcloud secrets versions add` (docs/infra/runbook.md › Secretos).
# Así ningún valor queda en el estado de Terraform, salvo los que genera la propia infraestructura.

locals {
  accessor_bindings = merge([
    for s, cfg in var.secrets : {
      for k, member in cfg.accessors : "${s}/${k}" => { secret = s, member = member }
    }
  ]...)
}

resource "google_secret_manager_secret" "this" {
  for_each  = var.secrets
  project   = var.project_id
  secret_id = "${var.prefix}-${each.key}"
  labels    = merge(var.labels, each.value.labels, { secreto = each.key })

  annotations = {
    descripcion = substr(each.value.description, 0, 250)
  }

  replication {
    auto {}
  }
}

resource "google_secret_manager_secret_iam_member" "accessors" {
  for_each  = local.accessor_bindings
  project   = var.project_id
  secret_id = google_secret_manager_secret.this[each.value.secret].secret_id
  role      = "roles/secretmanager.secretAccessor"
  member    = each.value.member
}

resource "google_secret_manager_secret_version" "generated" {
  for_each    = nonsensitive(toset(keys(var.generated_values)))
  secret      = google_secret_manager_secret.this[each.key].id
  secret_data = var.generated_values[each.key]
}
