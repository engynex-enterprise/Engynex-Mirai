module "monitoring" {
  source              = "../modules/monitoring"
  project_id          = var.project_id
  prefix              = local.prefix
  notification_emails = var.alert_emails

  cloud_run_services = merge(
    {
      (local.names.web) = { latency_p95_ms = var.services.web.latency_p95 }
      (local.names.api) = { latency_p95_ms = var.services.api.latency_p95 }
    },
    var.stages.realtime ? { (local.names.realtime) = { error_ratio = 0.05 } } : {},
  )

  uptime_checks = var.stages.load_balancer && var.stages.uptime_checks ? merge(
    {
      web = { host = var.domains.web, path = "/api/public/version" }
      api = { host = var.domains.api, path = "/healthz" }
    },
    var.stages.realtime ? { realtime = { host = var.domains.realtime, path = "/healthz" } } : {},
  ) : {}

  cloud_sql_instance = var.stages.cloud_sql ? module.cloud_sql[0].instance_name : null
  redis_instance_id  = var.stages.redis ? "projects/${var.project_id}/locations/${var.region}/instances/${local.prefix}-redis" : null
  task_queues        = values(module.tasks.queue_names)
}

module "budget" {
  count                    = var.budget.billing_account == null ? 0 : 1
  source                   = "../modules/budget"
  billing_account          = var.budget.billing_account
  project_number           = local.project_number
  display_name             = "Mirai ${local.env}"
  amount                   = var.budget.amount
  currency_code            = var.budget.currency_code
  notification_channel_ids = module.monitoring.notification_channel_ids
}
