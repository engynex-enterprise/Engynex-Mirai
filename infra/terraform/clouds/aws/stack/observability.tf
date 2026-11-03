module "monitoring" {
  source              = "../../../capabilities/monitoring/aws"
  context             = local.context
  notification_emails = var.alert_emails
  providers = {
    aws           = aws
    aws.us_east_1 = aws.us_east_1
  }

  services = merge(
    {
      (local.names.web)    = { latency_p95_ms = var.services.web.latency_p95 }
      (local.names.api)    = { latency_p95_ms = var.services.api.latency_p95 }
      (local.names.worker) = {}
    },
    var.features.realtime ? { (local.names.realtime) = { error_ratio = 0.05 } } : {},
    var.features.postgrest ? { (local.names.postgrest) = {} } : {},
  )

  uptime_checks = var.features.edge && var.features.uptime_checks ? merge(
    {
      web = { host = var.domains.web, path = "/api/public/version" }
      api = { host = var.domains.api, path = "/healthz" }
    },
    var.features.realtime ? { realtime = { host = var.domains.realtime, path = "/healthz" } } : {},
  ) : {}

  postgres_id = var.features.postgres ? module.postgres[0].instance_id : null
  redis_id    = var.features.redis ? module.redis[0].id : null
  queues      = values(module.queue.queue_names)

  cloud_options = {
    cluster_name   = module.platform.platform.cluster_name
    log_group_name = module.platform.platform.log_group_name
    target_groups = merge(
      {
        (local.names.web) = { target_group = module.web.edge_origin.target_group_arn_suffix, load_balancer = module.platform.platform.alb_arn_suffix }
        (local.names.api) = { target_group = module.api.edge_origin.target_group_arn_suffix, load_balancer = module.platform.platform.alb_arn_suffix }
      },
      var.features.realtime ? {
        (local.names.realtime) = { target_group = module.realtime[0].edge_origin.target_group_arn_suffix, load_balancer = module.platform.platform.alb_arn_suffix }
      } : {},
    )
  }
}

module "budget" {
  source                   = "../../../capabilities/budget/aws"
  context                  = local.context
  name                     = "Mirai ${local.env}"
  amount                   = var.budget.amount
  currency                 = "USD"
  billing_scope            = var.budget.billing_scope
  notification_emails      = var.alert_emails
  notification_channel_ids = module.monitoring.notification_channel_ids
}
