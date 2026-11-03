# budget (GCP): presupuesto de facturación del proyecto (envuelve modules/budget). billing_scope = cuenta de
# facturación; el proyecto sale de context.cloud.project_number. notification_emails crea canales de correo.

resource "google_monitoring_notification_channel" "email" {
  for_each     = var.notification_emails
  project      = var.context.cloud.project_id
  display_name = "${var.name} · presupuesto · ${each.key}"
  type         = "email"
  labels = {
    email_address = each.value
  }
}

module "this" {
  source                   = "../../../modules/budget"
  billing_account          = var.billing_scope
  project_number           = var.context.cloud.project_number
  display_name             = var.name
  amount                   = var.amount
  currency_code            = var.currency
  thresholds               = var.thresholds
  forecast_threshold       = var.forecast_threshold
  notification_channel_ids = concat(var.notification_channel_ids, [for c in google_monitoring_notification_channel.email : c.id])
}
