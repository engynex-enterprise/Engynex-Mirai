# Cuentas de servicio de un ambiente: una por servicio, sin llaves (Cloud Run, Scheduler y Tasks
# usan la identidad adjunta; nadie descarga JSON).

locals {
  # account_id: 6-30 caracteres. "mirai-produccion-scheduler" ya mide 26.
  account_ids = { for k, v in var.service_accounts : k => substr("${var.prefix}-${k}", 0, 30) }

  role_bindings = merge([
    for k, v in var.service_accounts : {
      for r in v.project_roles : "${k}/${r}" => { sa = k, role = r }
    }
  ]...)
}

resource "google_service_account" "this" {
  for_each     = var.service_accounts
  project      = var.project_id
  account_id   = local.account_ids[each.key]
  display_name = each.value.display_name
  description  = each.value.description
}

resource "google_project_iam_member" "roles" {
  for_each = local.role_bindings
  project  = var.project_id
  role     = each.value.role
  member   = "serviceAccount:${google_service_account.this[each.value.sa].email}"
}
