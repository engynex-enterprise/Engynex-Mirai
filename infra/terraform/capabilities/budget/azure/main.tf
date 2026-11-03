# Presupuesto mensual de consumo (avisa, no corta el gasto) con avisos por gasto real y por pronóstico.
# billing_scope: null → el grupo de recursos del ambiente; /subscriptions/<id> → toda la suscripción; otro id de grupo
# de recursos → ese grupo. currency se ignora (Azure presupuesta en la moneda de la facturación). La fecha de inicio es
# el primer día del mes en que se crea (Terraform la ignora después).
# context.cloud: resource_group_name, subscription_id (y opcional resource_group_id).

locals {
  rg_id = lookup(var.context.cloud, "resource_group_id", "/subscriptions/${var.context.cloud["subscription_id"]}/resourceGroups/${var.context.cloud["resource_group_name"]}")
  scope = coalesce(var.billing_scope, local.rg_id)
  # Se decide con billing_scope (conocido al planear), no con el id del grupo (se conoce al aplicar).
  is_sub = var.billing_scope != null && can(regex("^/subscriptions/[^/]+$", coalesce(var.billing_scope, "-")))
  name   = substr(replace(var.name, "/[^A-Za-z0-9_-]/", "-"), 0, 63)
  start  = formatdate("YYYY-MM-01'T'00:00:00Z", timestamp())
  emails = values(var.notification_emails)
  notifies = concat(
    [for t in var.thresholds : { threshold = t * 100, type = "Actual" }],
    [{ threshold = var.forecast_threshold * 100, type = "Forecasted" }],
  )
}

resource "azurerm_consumption_budget_resource_group" "this" {
  count             = local.is_sub ? 0 : 1
  name              = local.name
  resource_group_id = local.scope
  amount            = var.amount
  time_grain        = "Monthly"

  time_period {
    start_date = local.start
  }

  dynamic "notification" {
    for_each = local.notifies
    content {
      enabled        = true
      operator       = "GreaterThanOrEqualTo"
      threshold      = notification.value.threshold
      threshold_type = notification.value.type
      contact_emails = local.emails
      contact_groups = var.notification_channel_ids
    }
  }

  lifecycle {
    ignore_changes = [time_period]
  }
}

resource "azurerm_consumption_budget_subscription" "this" {
  count           = local.is_sub ? 1 : 0
  name            = local.name
  subscription_id = local.scope
  amount          = var.amount
  time_grain      = "Monthly"

  time_period {
    start_date = local.start
  }

  dynamic "notification" {
    for_each = local.notifies
    content {
      enabled        = true
      operator       = "GreaterThanOrEqualTo"
      threshold      = notification.value.threshold
      threshold_type = notification.value.type
      contact_emails = local.emails
      contact_groups = var.notification_channel_ids
    }
  }

  lifecycle {
    ignore_changes = [time_period]
  }
}
