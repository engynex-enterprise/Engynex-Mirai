# budget/aws: AWS Budgets mensual de costo con avisos por gasto real (thresholds) y por pronóstico, a correos y SNS.
# Recomendado: una cuenta de AWS por ambiente (como un proyecto por ambiente en GCP), así el presupuesto es el de la
# cuenta. billing_scope se ignora. AWS factura en USD: currency COP no aplica (se usa USD).
# cloud_options: tag_filter (bool, false) = filtra por la etiqueta ambiente=<ambiente> (cuenta compartida; requiere
# activar la etiqueta de asignación de costos "ambiente" en Billing).

locals {
  subscribers = length(var.notification_emails) + length(var.notification_channel_ids) > 0
}

resource "aws_budgets_budget" "this" {
  name         = var.name
  budget_type  = "COST"
  limit_amount = tostring(var.amount)
  limit_unit   = "USD"
  time_unit    = "MONTHLY"

  dynamic "cost_filter" {
    for_each = try(var.cloud_options.tag_filter, false) ? [1] : []
    content {
      name   = "TagKeyValue"
      values = [format("user:ambiente$%s", var.context.environment)]
    }
  }

  dynamic "notification" {
    for_each = local.subscribers ? var.thresholds : []
    content {
      comparison_operator        = "GREATER_THAN"
      notification_type          = "ACTUAL"
      threshold                  = notification.value * 100
      threshold_type             = "PERCENTAGE"
      subscriber_email_addresses = values(var.notification_emails)
      subscriber_sns_topic_arns  = var.notification_channel_ids
    }
  }

  dynamic "notification" {
    for_each = local.subscribers ? [var.forecast_threshold] : []
    content {
      comparison_operator        = "GREATER_THAN"
      notification_type          = "FORECASTED"
      threshold                  = notification.value * 100
      threshold_type             = "PERCENTAGE"
      subscriber_email_addresses = values(var.notification_emails)
      subscriber_sns_topic_arns  = var.notification_channel_ids
    }
  }

  tags = var.context.labels
}
