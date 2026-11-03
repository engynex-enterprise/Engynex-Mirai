module "network" {
  source              = "../../../capabilities/network/aws"
  context             = local.context
  cidr                = var.network.cidr
  zones               = var.network.zones
  nat                 = true
  nat_static_ip_count = var.network.nat_static_ip_count
  private_services    = var.features.postgres || var.features.redis
  flow_logs           = var.network.flow_logs
  cloud_options       = { nat_per_zone = var.aws.nat_per_zone }
}

module "platform" {
  source             = "../../../capabilities/container-platform/aws"
  context            = local.context
  network            = module.network.network
  log_retention_days = var.aws.log_retention_days
  cloud_options      = { container_insights = var.aws.container_insights }
}

module "identity" {
  source  = "../../../capabilities/identity/aws"
  context = local.context

  identities = {
    web       = { display_name = "Mirai ${local.env} · web (Next.js)", capabilities = ["logs", "metrics", "traces", "errors"] }
    api       = { display_name = "Mirai ${local.env} · api (NestJS)", capabilities = ["logs", "metrics", "traces", "errors", "ai"] }
    realtime  = { display_name = "Mirai ${local.env} · realtime (socket.io)", capabilities = ["logs", "metrics", "traces"] }
    worker    = { display_name = "Mirai ${local.env} · worker (colas)", capabilities = ["logs", "metrics", "traces", "errors", "ai"] }
    postgrest = { display_name = "Mirai ${local.env} · postgrest (puente interno)", capabilities = ["logs"] }
    scheduler = { display_name = "Mirai ${local.env} · cron (EventBridge Scheduler)", capabilities = ["logs"] }
    migrator  = { display_name = "Mirai ${local.env} · migraciones SQL", capabilities = ["logs"] }
  }
}

resource "random_password" "better_auth" {
  count   = var.auth_provider == "mirai" ? 1 : 0
  length  = 64
  special = false
}

resource "random_password" "postgrest_jwt" {
  count   = var.features.postgrest ? 1 : 0
  length  = 64
  special = false
}

module "secrets" {
  source  = "../../../capabilities/secrets/aws"
  context = local.context

  secrets = {
    for k, s in module.app.secret_catalog : k => {
      description = s.description
      accessors   = { for svc in module.app.secret_readers[k] : svc => module.identity.principals[local.svc_identity[svc]] }
    }
  }

  generated_values = merge(
    var.features.postgres ? {
      "database-url"       = module.postgres[0].connection_urls["app"]
      "database-admin-url" = module.postgres[0].admin_url
    } : {},
    var.features.postgres && var.features.postgrest ? { "postgrest-db-uri" = module.postgres[0].connection_urls["postgrest"] } : {},
    var.features.redis ? { "redis-url" = module.redis[0].url } : {},
    var.auth_provider == "mirai" ? { "better-auth-secret" = random_password.better_auth[0].result } : {},
    var.features.postgrest ? { "postgrest-jwt-secret" = random_password.postgrest_jwt[0].result } : {},
  )

  cloud_options = { recovery_window_days = local.is_prod ? 30 : 0 }
}
