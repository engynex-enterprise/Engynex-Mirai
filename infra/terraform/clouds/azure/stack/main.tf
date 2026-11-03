# Composición de un ambiente de Mirai en Azure con las capacidades de capabilities/*/azure y la configuración sin nube
# de capabilities/app-config (las mismas variables, secretos y rutas que en GCP y AWS).

# ── Red y plataforma ─────────────────────────────────────────────────────────────────────────────────────────────
module "network" {
  source              = "../../../capabilities/network/azure"
  context             = local.context
  cidr                = var.network.cidr
  zones               = var.network.zones
  nat_static_ip_count = var.network.nat_static_ip_count
  flow_logs           = var.network.flow_logs
  private_services    = local.f.postgres || local.f.redis
}

module "platform" {
  source             = "../../../capabilities/container-platform/azure"
  context            = local.context
  network            = module.network.network
  log_retention_days = local.is_prod ? 90 : 30
  cloud_options = {
    internal       = var.azure.private_link
    zone_redundant = var.azure.zone_redundant
  }
}

# ── Identidades ──────────────────────────────────────────────────────────────────────────────────────────────────
module "identity" {
  source  = "../../../capabilities/identity/azure"
  context = local.context
  identities = {
    web       = { display_name = "Mirai ${local.env} · web (Next.js)", capabilities = ["logs", "metrics"] }
    api       = { display_name = "Mirai ${local.env} · api (NestJS)", capabilities = ["logs", "metrics", "traces", "errors", "ai"] }
    realtime  = { display_name = "Mirai ${local.env} · realtime (socket.io)", capabilities = ["logs", "metrics"] }
    worker    = { display_name = "Mirai ${local.env} · worker (colas)", capabilities = ["logs", "metrics", "ai"] }
    postgrest = { display_name = "Mirai ${local.env} · postgrest (interno)", capabilities = ["logs"] }
    scheduler = { display_name = "Mirai ${local.env} · cron (Container Apps Jobs)", capabilities = ["logs"] }
    migrator  = { display_name = "Mirai ${local.env} · migraciones SQL", capabilities = ["logs"] }
  }
}

locals {
  id        = module.identity.handles
  principal = module.identity.principals
  # Servicio del catálogo de secretos → identidad.
  svc_identity = { web = "web", api = "api", realtime = "realtime", worker = "worker", postgrest = "postgrest", migrate = "migrator", scheduler = "scheduler" }
}

# Las identidades bajan las imágenes del ACR del bootstrap.
resource "azurerm_role_assignment" "acr_pull" {
  for_each             = var.azure.registry_id == null ? {} : local.principal
  scope                = var.azure.registry_id
  role_definition_name = "AcrPull"
  principal_id         = each.value
  principal_type       = "ServicePrincipal"
}

# ── Configuración de la app (sin nube) ───────────────────────────────────────────────────────────────────────────
locals {
  storage_env = local.f.storage ? {
    OBJECT_STORE                  = "azure-blob"
    AZURE_STORAGE_CONTAINER       = "objetos"
    STORAGE_BUCKET_PRIVATE        = module.storage[0].bucket_names["private"]
    STORAGE_BUCKET_PUBLIC         = module.storage[0].bucket_names["public"]
    STORAGE_BUCKET_BACKUPS        = module.storage[0].bucket_names["backups"]
    AZURE_STORAGE_ACCOUNT_PRIVATE = module.storage[0].bucket_names["private"]
    AZURE_STORAGE_ACCOUNT_PUBLIC  = module.storage[0].bucket_names["public"]
    AZURE_STORAGE_ACCOUNT_BACKUPS = module.storage[0].bucket_names["backups"]
  } : {}
}

# IA de la plataforma (V7-P): Azure OpenAI con identidad administrada (rol "Cognitive Services OpenAI User", permiso
# abstracto "ai" de la API y el worker). Sin endpoint, el orden de respaldo es el del registro.
locals {
  ai_env = var.azure.openai_endpoint == null ? {} : {
    AI_PLATFORM_PROVIDER  = "azure"
    AZURE_OPENAI_ENDPOINT = var.azure.openai_endpoint
  }
}

module "app" {
  source            = "../../../capabilities/app-config"
  environment       = var.environment
  git_branch        = local.git_branch
  domains           = var.domains
  same_origin       = var.same_origin
  extra_web_origins = var.extra_web_origins
  public_config     = var.public_config
  auth_provider     = var.auth_provider
  db_adapter        = var.db_adapter
  live_source       = var.live_source
  optional_secrets  = var.optional_secrets

  features = {
    postgres  = local.f.postgres
    redis     = local.f.redis
    realtime  = local.f.realtime
    postgrest = local.f.postgrest
    worker    = local.f.worker
    storage   = local.f.storage
    supabase  = local.f.supabase
    vertex_ai = false
    otel      = local.f.otel
  }

  internal_urls = {
    api       = local.internal_url.api
    postgrest = local.f.postgrest ? local.internal_url.postgrest : null
  }

  cloud_env = {
    api      = merge(local.storage_env, module.queue.env, local.ai_env, { AZURE_CLIENT_ID = local.id["api"].client_id })
    realtime = { AZURE_CLIENT_ID = local.id["realtime"].client_id }
    worker   = merge(local.storage_env, module.queue.env, local.ai_env, { AZURE_CLIENT_ID = local.id["worker"].client_id })
    web      = { AZURE_CLIENT_ID = local.id["web"].client_id }
  }

  api_env      = var.api_env
  realtime_env = var.realtime_env
  worker_env   = var.worker_env
  web_env      = var.web_env
}

# ── Datos ────────────────────────────────────────────────────────────────────────────────────────────────────────
module "storage" {
  count   = local.f.storage ? 1 : 0
  source  = "../../../capabilities/object-storage/azure"
  context = local.context
  cloud_options = {
    account_names = var.azure.storage_account_names
  }

  buckets = {
    private = {
      name          = "${local.prefix}-private-${var.bucket_suffix}"
      cors_origins  = module.app.web_origins
      force_destroy = !var.deletion_protection
      writers       = { api = local.principal["api"], worker = local.principal["worker"] }
      lifecycle     = [{ prefix = "tmp/", age_days = 1 }]
    }
    backups = {
      name                = "${local.prefix}-backups-${var.bucket_suffix}"
      versioning          = true
      noncurrent_ttl_days = 30
      soft_delete_days    = 14
      cors_origins        = module.app.web_origins
      cors_methods        = ["GET", "HEAD"]
      force_destroy       = !var.deletion_protection
      writers             = { api = local.principal["api"], worker = local.principal["worker"] }
      lifecycle           = [{ prefix = "exports/", age_days = 7 }]
    }
    public = {
      name          = "${local.prefix}-public-${var.bucket_suffix}"
      public_read   = true
      cors_origins  = module.app.web_origins
      cors_methods  = ["GET", "HEAD", "PUT"]
      force_destroy = !var.deletion_protection
      writers       = { api = local.principal["api"], worker = local.principal["worker"] }
    }
  }
}

module "postgres" {
  count               = local.f.postgres ? 1 : 0
  source              = "../../../capabilities/postgres/azure"
  context             = local.context
  network             = module.network.network
  name                = "${local.prefix}-pg"
  engine_version      = var.postgres.engine_version
  size                = var.postgres.size
  high_availability   = var.postgres.high_availability
  storage_gb          = var.postgres.storage_gb
  backup_days         = var.postgres.backup_days
  pitr_days           = var.postgres.pitr_days
  max_connections     = var.postgres.max_connections
  deletion_protection = var.deletion_protection
  app_users           = merge({ app = "mirai_app" }, local.f.postgrest ? { postgrest = "authenticator" } : {})
  cloud_options = merge(
    { zone = var.azure.postgres_zone },
    var.postgres.tier == null ? {} : { tier = var.postgres.tier },
  )
}

module "redis" {
  count             = local.f.redis ? 1 : 0
  source            = "../../../capabilities/redis/azure"
  context           = local.context
  network           = module.network.network
  name              = "${local.prefix}-redis"
  high_availability = var.redis.high_availability
  memory_gb         = var.redis.memory_gb
  tls               = true
}

# ── Colas ────────────────────────────────────────────────────────────────────────────────────────────────────────
module "queue" {
  source        = "../../../capabilities/queue/azure"
  context       = local.context
  enabled       = var.azure.queue_driver == "servicebus"
  target        = { url = local.internal_url.api }
  enqueuers     = { api = local.principal["api"] }
  consumers     = { worker = local.principal["worker"] }
  cloud_options = var.azure.servicebus_namespace == null ? {} : { namespace_name = var.azure.servicebus_namespace }

  # Los mismos ids literales de QueueName (apps/api/src/core/queue/queue.port.ts).
  queues = {
    notify      = { max_per_second = 20, max_concurrent = 20, max_attempts = 5, max_retry_s = 3000 }
    automations = { max_per_second = 10, max_concurrent = 10, max_attempts = 5 }
    slow        = { max_per_second = 2, max_concurrent = 4, max_attempts = 3, min_backoff_s = 60, max_backoff_s = 1800, max_retry_s = 21600 }
  }
}

# ── Secretos ─────────────────────────────────────────────────────────────────────────────────────────────────────
resource "random_password" "better_auth" {
  count   = var.auth_provider == "mirai" ? 1 : 0
  length  = 48
  special = false
}

resource "random_password" "postgrest_jwt" {
  count   = local.f.postgrest ? 1 : 0
  length  = 48
  special = false
}

locals {
  # El trabajo de migraciones también lee las URL de la app y de PostgREST para crear esos roles con su clave
  # (Flexible Server no tiene API para crear usuarios de Postgres).
  migrate_extra_secrets = merge(
    local.f.postgres ? { MIRAI_APP_DATABASE_URL = "database-url" } : {},
    local.f.postgres && local.f.postgrest ? { MIRAI_POSTGREST_DATABASE_URL = "postgrest-db-uri" } : {},
  )

  secret_readers = {
    for k, svcs in module.app.secret_readers : k => distinct(concat(svcs, contains(values(local.migrate_extra_secrets), k) ? ["migrate"] : []))
  }
}

module "secrets" {
  source  = "../../../capabilities/secrets/azure"
  context = local.context
  cloud_options = merge(
    var.azure.key_vault_name == null ? {} : { vault_name = var.azure.key_vault_name },
    { purge_protection = var.deletion_protection },
  )

  secrets = {
    for k, s in module.app.secret_catalog : k => {
      description = s.description
      accessors   = { for svc in local.secret_readers[k] : svc => local.principal[local.svc_identity[svc]] }
    }
  }

  generated_values = merge(
    local.f.postgres ? {
      "database-url"       = module.postgres[0].connection_urls["app"]
      "database-admin-url" = module.postgres[0].admin_url
    } : {},
    local.f.postgres && local.f.postgrest ? { "postgrest-db-uri" = module.postgres[0].connection_urls["postgrest"] } : {},
    local.f.postgrest ? { "postgrest-jwt-secret" = random_password.postgrest_jwt[0].result } : {},
    local.f.redis ? { "redis-url" = module.redis[0].url } : {},
    var.auth_provider == "mirai" ? { "better-auth-secret" = random_password.better_auth[0].result } : {},
  )
}

locals {
  refs = module.secrets.refs

  secret_env = { for svc, m in module.app.mounted_secrets : svc => { for env, key in m : env => local.refs[key] } }
}

# ── Servicios de contenedores ────────────────────────────────────────────────────────────────────────────────────
locals {
  services = merge(
    {
      web = {
        identity = "web", ingress = "edge", image = var.images.web, port = 8080, affinity = false, no_ingress = false
        cpu      = var.services.web.cpu, min = var.services.web.min_instances, max = var.services.web.max_instances, concurrency = var.services.web.concurrency
        timeout  = var.services.web.timeout, health = "/api/public/version", probes = { startup = "tcp", liveness = false }
        env      = module.app.env.web, secrets = local.secret_env["web"], description = "Mirai web (Next.js) · ${local.env}"
      }
      api = {
        identity = "api", ingress = "edge", image = var.images.api, port = 8080, affinity = false, no_ingress = false
        cpu      = var.services.api.cpu, min = var.services.api.min_instances, max = var.services.api.max_instances, concurrency = var.services.api.concurrency
        timeout  = var.services.api.timeout, health = "/healthz", probes = { startup = "tcp", liveness = true }
        env      = module.app.env.api, secrets = local.secret_env["api"], description = "Mirai API (NestJS) · ${local.env}"
      }
    },
    local.f.realtime ? {
      realtime = {
        identity = "realtime", ingress = "edge", image = var.images.api, port = 8080, affinity = true, no_ingress = false
        cpu      = var.services.realtime.cpu, min = var.services.realtime.min_instances, max = var.services.realtime.max_instances, concurrency = var.services.realtime.concurrency
        timeout  = 3600, health = "/healthz", probes = { startup = "http", liveness = true }
        env      = module.app.env.realtime, secrets = local.secret_env["realtime"], description = "Mirai realtime (socket.io) · ${local.env}"
      }
    } : {},
    local.f.postgrest ? {
      postgrest = {
        identity = "postgrest", ingress = "internal", image = var.images.postgrest, port = 8080, affinity = false, no_ingress = false
        cpu      = var.services.postgrest.cpu, min = var.services.postgrest.min_instances, max = var.services.postgrest.max_instances, concurrency = var.services.postgrest.concurrency
        timeout  = 60, health = null, probes = { startup = "tcp", liveness = false }
        env      = module.app.env.postgrest, secrets = local.secret_env["postgrest"], description = "Mirai PostgREST interno (D4) · ${local.env}"
      }
    } : {},
    local.f.worker ? {
      worker = {
        identity = "worker", ingress = "internal", image = var.images.api, port = 8080, affinity = false, no_ingress = true
        cpu      = var.services.worker.cpu, min = var.services.worker.min_instances, max = var.services.worker.max_instances, concurrency = 1
        timeout  = 300, health = null, probes = { startup = "tcp", liveness = false }
        env      = module.app.env.worker, secrets = local.secret_env["worker"], description = "Mirai worker (colas) · ${local.env}"
      }
    } : {},
  )
}

module "service" {
  for_each            = local.services
  source              = "../../../capabilities/container-service/azure"
  context             = local.context
  platform            = module.platform.platform
  identity            = local.id[each.value.identity]
  name                = local.names[each.key]
  description         = each.value.description
  image               = each.value.image
  port                = each.value.port
  cpu                 = each.value.cpu
  min_instances       = each.value.min
  max_instances       = each.value.max
  concurrency         = each.value.concurrency
  timeout_s           = each.value.timeout
  session_affinity    = each.value.affinity
  ingress             = each.value.ingress
  health_path         = each.value.health
  probes              = each.value.probes
  env                 = each.value.env
  secret_env          = each.value.secrets
  deletion_protection = var.deletion_protection
  cloud_options = merge(
    { no_ingress = each.value.no_ingress },
    local.registry_server == null ? {} : { registry_server = local.registry_server },
    # Colector OpenTelemetry (V7-Q) como sidecar de la API, el gateway y el worker (Application Insights / Azure Monitor).
    local.f.otel && contains(["api", "realtime", "worker"], each.key) ? {
      otel_collector = {
        image  = var.images.otel_collector
        config = file("${path.module}/../../../../otel/collector.azure.yaml")
        # La cadena de conexión es un punto de ingesta (no da acceso de lectura); puede pasar a Key Vault más adelante.
        env = { APPLICATIONINSIGHTS_CONNECTION_STRING = nonsensitive(azurerm_application_insights.otel[0].connection_string), MIRAI_ENV = var.environment }
      }
    } : {},
  )

  # Los permisos sobre Key Vault y ACR deben existir antes de crear la revisión.
  depends_on = [module.secrets, azurerm_role_assignment.acr_pull]
}

# ── Migraciones (Container Apps Job manual; lo dispara infra/deploy/azure/migrar.sh) ────────────────────────────
locals {
  migrate_secrets = merge(module.app.mounted_secrets["migrate"], local.migrate_extra_secrets)
}

resource "azurerm_container_app_job" "migrate" {
  count                        = local.f.postgres ? 1 : 0
  name                         = "${local.prefix}-db-migrate"
  resource_group_name          = local.rg_name
  location                     = var.region
  container_app_environment_id = module.platform.id
  workload_profile_name        = "Consumption"
  replica_timeout_in_seconds   = 1800
  replica_retry_limit          = 0
  tags                         = merge(local.labels, { servicio = "db-migrate" })

  identity {
    type         = "UserAssigned"
    identity_ids = [local.id["migrator"].id]
  }

  manual_trigger_config {
    parallelism              = 1
    replica_completion_count = 1
  }

  dynamic "registry" {
    for_each = local.registry_server == null ? [] : [local.registry_server]
    content {
      server   = registry.value
      identity = local.id["migrator"].id
    }
  }

  dynamic "secret" {
    for_each = local.migrate_secrets
    content {
      name                = lower(replace(secret.key, "_", "-"))
      key_vault_secret_id = local.refs[secret.value]
      identity            = local.id["migrator"].id
    }
  }

  template {
    container {
      name    = "db-migrate"
      image   = coalesce(var.images.api, "mcr.microsoft.com/k8se/quickstart:latest")
      cpu     = 0.5
      memory  = "1Gi"
      command = var.migrate_job.command
      args    = var.migrate_job.args

      dynamic "env" {
        for_each = module.app.env.migrate
        content {
          name  = env.key
          value = env.value
        }
      }

      dynamic "env" {
        for_each = local.migrate_secrets
        content {
          name        = env.key
          secret_name = lower(replace(env.key, "_", "-"))
        }
      }
    }
  }

  lifecycle {
    ignore_changes = [template[0].container[0].image]
  }

  depends_on = [module.secrets, azurerm_role_assignment.acr_pull]
}

# ── Cron ─────────────────────────────────────────────────────────────────────────────────────────────────────────
# Reparto (apps/api/src/modules/jobs/jobs.service.ts): el tick horario encola los avisos por hogar y las tareas diarias
# (TICK_DAILY_TASKS=1); el drain procesa automation_events. Los mismos dos trabajos que en GCP.
module "scheduler" {
  source     = "../../../capabilities/scheduler/azure"
  context    = local.context
  platform   = module.platform.platform
  identity   = local.id["scheduler"]
  secret_ref = local.refs["cron-secret"]
  paused     = local.f.scheduler_paused
  target     = { base_url = local.internal_url.api }

  jobs = {
    notify-tick = {
      schedule    = "5 * * * *"
      path        = "/v1/jobs/notify/tick"
      description = "Avisos: latido, reparto por hogar y tareas diarias de las 6 y las 9."
      body        = jsonencode({ dry = var.scheduler_dry_run })
    }
    automations-drain = {
      schedule    = "*/5 * * * *"
      path        = "/v1/jobs/automations/drain"
      description = "Procesa lo que quede en automation_events (escrituras fuera de la API)."
      body        = jsonencode({ dry = var.scheduler_dry_run })
      retry_count = 1
    }
  }

  depends_on = [module.secrets]
}

# ── Borde ────────────────────────────────────────────────────────────────────────────────────────────────────────
module "edge" {
  count   = local.f.edge ? 1 : 0
  source  = "../../../capabilities/edge/azure"
  context = local.context
  name    = local.prefix

  origins = merge(
    {
      web = { origin = module.service["web"].edge_origin, cdn = true, log_sample_rate = var.log_sample_rate }
      api = { origin = module.service["api"].edge_origin, log_sample_rate = var.log_sample_rate }
    },
    local.f.realtime ? { realtime = { origin = module.service["realtime"].edge_origin, log_sample_rate = var.log_sample_rate } } : {},
  )
  bucket_origins            = local.f.storage ? { files = { origin = module.storage[0].public_origin["public"] } } : {}
  hosts                     = module.app.hosts
  routes                    = module.app.routes
  default_origin            = "web"
  certificate_domains       = var.domains.certificate
  dns_authorization_domains = var.domains.dns_authorization_domains
  waf                       = var.waf
  cloud_options             = { private_link = var.azure.private_link }
}

module "dns" {
  count       = local.f.dns && local.f.edge ? 1 : 0
  source      = "../../../capabilities/dns/azure"
  context     = local.context
  zone_name   = var.dns.zone_name
  create_zone = var.dns.create_zone
  records = [
    for k, rs in { for r in module.edge[0].dns_records : "${r.type}/${r.name}" => r... } : {
      name   = rs[0].name
      type   = rs[0].type
      values = [for r in rs : r.data]
    }
  ]
}

# ── Observabilidad y costos ──────────────────────────────────────────────────────────────────────────────────────
module "monitoring" {
  source              = "../../../capabilities/monitoring/azure"
  context             = local.context
  notification_emails = var.alert_emails

  services = merge(
    { (local.names.web) = {}, (local.names.api) = {} },
    local.f.realtime ? { (local.names.realtime) = { error_ratio = 0.05 } } : {},
  )

  uptime_checks = local.f.edge && local.f.uptime_checks ? merge(
    {
      web = { host = var.domains.web, path = "/api/public/version" }
      api = { host = var.domains.api, path = "/healthz" }
    },
    local.f.realtime ? { realtime = { host = var.domains.realtime, path = "/healthz" } } : {},
  ) : {}

  postgres_id = local.f.postgres ? module.postgres[0].instance_id : null
  redis_id    = local.f.redis ? module.redis[0].id : null
  queues      = keys(module.queue.queue_names)

  cloud_options = {
    watch_postgres             = local.f.postgres
    watch_redis                = local.f.redis
    watch_queues               = var.azure.queue_driver == "servicebus"
    log_analytics_workspace_id = module.platform.platform.log_analytics_workspace_id
    servicebus_namespace_id    = length(module.queue.queue_ids) > 0 ? replace(values(module.queue.queue_ids)[0], "/\\/queues\\/[^/]+$/", "") : null
  }
}

module "budget" {
  source                   = "../../../capabilities/budget/azure"
  context                  = local.context
  name                     = "Mirai ${local.env}"
  billing_scope            = var.budget.billing_scope
  amount                   = var.budget.amount
  currency                 = var.budget.currency
  notification_emails      = var.alert_emails
  notification_channel_ids = module.monitoring.notification_channel_ids
}

# Destino de las trazas y métricas del colector OpenTelemetry (features.otel), sobre el Log Analytics del entorno.
resource "azurerm_application_insights" "otel" {
  count               = local.f.otel ? 1 : 0
  name                = "${local.prefix}-otel"
  location            = var.region
  resource_group_name = local.rg_name
  workspace_id        = module.platform.platform.log_analytics_workspace_id
  application_type    = "Node.JS"
  tags                = local.labels
}
