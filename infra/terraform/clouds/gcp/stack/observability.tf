module "monitoring" {
  source              = "../../../capabilities/monitoring/gcp"
  context             = local.context
  notification_emails = var.alert_emails

  services = merge(
    {
      (local.names.web) = { latency_p95_ms = var.services.web.latency_p95 }
      (local.names.api) = { latency_p95_ms = var.services.api.latency_p95 }
    },
    local.f.realtime ? { (local.names.realtime) = { error_ratio = 0.05 } } : {},
    local.f.postgrest ? { (local.names.postgrest) = {} } : {},
  )

  uptime_checks = local.f.edge && local.f.uptime_checks ? merge(
    {
      web = { host = var.domains.web, path = "/api/public/version" }
      api = { host = var.domains.api, path = "/healthz" }
    },
    local.f.realtime ? { realtime = { host = var.domains.realtime, path = "/healthz" } } : {},
  ) : {}

  postgres_id = local.f.postgres ? module.cloud_sql[0].instance_id : null
  redis_id    = local.f.redis ? module.redis[0].id : null
  queues      = values(module.tasks.queue_names)
}

module "budget" {
  count                    = var.budget.billing_scope == null ? 0 : 1
  source                   = "../../../capabilities/budget/gcp"
  context                  = local.context
  name                     = "Mirai ${local.env}"
  billing_scope            = var.budget.billing_scope
  amount                   = var.budget.amount
  currency                 = var.budget.currency
  notification_channel_ids = module.monitoring.notification_channel_ids
}
