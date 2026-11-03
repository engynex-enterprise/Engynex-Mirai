# Servicios de Cloud Run: web (Next.js standalone), api (NestJS) y realtime (socket.io, etapa 3).
# Nombres de variables = los que validan con zod apps/api/src/core/config/config.schema.ts (núcleo),
# modules/integrations/services-env.ts (F2-E), modules/billing/billing.config.ts (F2-I),
# modules/households/site-url.ts y modules/realtime/realtime.config.ts (F2-G). Inventario con su origen (variable o
# Secret Manager): docs/infra/estrategia-gcp.md §5 y §6. Extras sin tocar el stack: var.api_env y var.realtime_env.

locals {
  vpc_base = {
    network    = module.network.network_id
    subnetwork = module.network.subnet_id
    tags       = local.run_tags
  }

  # Valores públicos que pueden faltar en public_config: si están vacíos no se mandan (la API los toma como "sin definir").
  api_public = { for k, v in {
    GOOGLE_CLIENT_ID = lookup(var.public_config, "GOOGLE_CLIENT_ID", "")
    VAPID_PUBLIC_KEY = lookup(var.public_config, "NEXT_PUBLIC_VAPID_PUBLIC_KEY", "")
    VAPID_SUBJECT    = lookup(var.public_config, "VAPID_SUBJECT", "")
    WOMPI_PUBLIC_KEY = lookup(var.public_config, "NEXT_PUBLIC_WOMPI_PUBLIC_KEY", "")
  } : k => v if v != "" }

  # Comunes a los dos modos de la misma imagen (MODE=api y MODE=realtime).
  api_common_env = {
    MIRAI_ENV                = local.env
    NODE_ENV                 = "production"
    LOG_LEVEL                = local.is_prod ? "info" : "debug"
    SUPABASE_URL             = var.public_config["NEXT_PUBLIC_SUPABASE_URL"]
    SUPABASE_PUBLISHABLE_KEY = var.public_config["NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"]
    WEB_ORIGINS              = join(",", local.web_origins) # CORS (api) y origen del WebSocket (realtime)
    DB_ADAPTER               = var.db_adapter
    GIT_BRANCH               = trim(var.cicd.branch_regex, "^$") # consola › Sistema (GIT_COMMIT sale de K_REVISION)
  }

  api_env = merge(
    local.api_common_env,
    local.api_public,
    {
      MODE = "api"

      # Cron (SchedulerGuard): token OIDC de Scheduler o de Tasks con audiencia = URL *.run.app de la API.
      SCHEDULER_AUDIENCE         = local.run_url.api
      SCHEDULER_SERVICE_ACCOUNTS = join(",", [module.iam.emails["scheduler"], module.iam.emails["tasks"]])

      # Colas (CloudTasksQueue): projects/<GCP_PROJECT>/locations/<GCP_LOCATION>/queues/<notify|automations|slow>.
      QUEUE_DRIVER          = "cloudtasks"
      GCP_PROJECT           = var.project_id
      GCP_LOCATION          = var.region
      TASKS_SERVICE_ACCOUNT = module.iam.emails["tasks"]
      API_BASE_URL          = local.run_url.api # Cloud Tasks llama de vuelta por la URL interna (sin pasar por Armor)
      TICK_DAILY_TASKS      = "1"               # el tick encola refs, calendar, net-worth y plan-reminders (jobs.tf)
      AUTOMATIONS_OUTBOX    = "1"

      # Enlaces: la web (correos, invitaciones, retorno de pagos y de Google) y la API pública (callback de Google:
      # <API_PUBLIC_URL>/v1/google/callback, hay que registrarlo en el cliente OAuth).
      SITE_URL       = local.web_origin
      API_PUBLIC_URL = local.api_origin
    },
    var.stages.storage ? {
      # Para FilesModule (F2-D). El núcleo aún no los lee; quedan listos con los nombres del contrato.
      STORAGE_BUCKET_PRIVATE = module.storage[0].names["private"]
      STORAGE_BUCKET_PUBLIC  = module.storage[0].names["public"]
      STORAGE_BUCKET_BACKUPS = module.storage[0].names["backups"]
      PUBLIC_FILES_URL       = local.files_origin
    } : {},
    # Con Redis (REDIS_URL en Secret Manager), la API publica sus cambios para el gateway (@socket.io/redis-emitter).
    var.stages.redis ? { REALTIME_API_EMIT = "1" } : {},
    var.api_env,
  )

  # Gateway: misma imagen con MODE=realtime. No monta /v1/jobs ni las colas, así que no lleva cron ni Cloud Tasks.
  realtime_env = merge(
    local.api_common_env,
    { MODE = "realtime" },
    var.realtime_env,
  )
}

module "web" {
  source                = "../modules/cloud-run-service"
  project_id            = var.project_id
  region                = var.region
  name                  = local.names.web
  description           = "Mirai web (Next.js) · ${local.env}"
  labels                = merge(local.labels, { servicio = "web" })
  service_account_email = module.iam.emails["web"]
  cpu                   = var.services.web.cpu
  memory                = var.services.web.memory
  min_instances         = var.services.web.min_instances
  max_instances         = var.services.web.max_instances
  concurrency           = var.services.web.concurrency
  timeout_seconds       = var.services.web.timeout # /api/chat sigue en la web hasta que el chat pase a la API
  ingress               = local.ingress
  deletion_protection   = var.deletion_protection

  # ALL_TRAFFIC: la web llama a la API por *.run.app como tráfico interno (Private Google Access) y sale a internet
  # (Supabase, IA) por Cloud NAT.
  vpc = merge(local.vpc_base, { egress = "ALL_TRAFFIC" })

  # Los NEXT_PUBLIC_* valen lo que se incrustó en el build (locals.web_build_env); aquí se repiten para el servidor.
  env = merge(var.public_config, local.web_live_env, {
    MIRAI_ENV               = local.env
    HOSTNAME                = "0.0.0.0"
    NEXT_TELEMETRY_DISABLED = "1"
    NEXT_PUBLIC_SITE_URL    = local.web_origin
    NEXT_PUBLIC_API_URL     = local.api_origin
    API_INTERNAL_URL        = local.run_url.api
  })
  secret_env = local.mounted_secrets["web"]

  depends_on = [module.secrets]
}

module "api" {
  source                = "../modules/cloud-run-service"
  project_id            = var.project_id
  region                = var.region
  name                  = local.names.api
  description           = "Mirai API (NestJS) · ${local.env}"
  labels                = merge(local.labels, { servicio = "api" })
  service_account_email = module.iam.emails["api"]
  cpu                   = var.services.api.cpu
  memory                = var.services.api.memory
  min_instances         = var.services.api.min_instances
  max_instances         = var.services.api.max_instances
  concurrency           = var.services.api.concurrency
  timeout_seconds       = var.services.api.timeout # chat NDJSON hasta 300 s (§2.7.11)
  ingress               = local.ingress
  deletion_protection   = var.deletion_protection
  vpc                   = merge(local.vpc_base, { egress = var.services.api.vpc_egress })
  liveness_path         = var.services.api.liveness_path

  env        = local.api_env
  secret_env = local.mounted_secrets["api"]

  # Scheduler y Tasks cuentan como tráfico interno; la API valida su token OIDC (SchedulerGuard).
  invoker_members = {
    scheduler = module.iam.members["scheduler"]
    tasks     = module.iam.members["tasks"]
  }

  depends_on = [module.secrets]
}

module "realtime" {
  count                 = var.stages.realtime ? 1 : 0
  source                = "../modules/cloud-run-service"
  project_id            = var.project_id
  region                = var.region
  name                  = local.names.realtime
  description           = "Mirai realtime (socket.io) · ${local.env}"
  labels                = merge(local.labels, { servicio = "realtime" })
  service_account_email = module.iam.emails["realtime"]
  cpu                   = var.services.realtime.cpu
  memory                = var.services.realtime.memory
  cpu_idle              = !var.services.realtime.cpu_always_on
  min_instances         = var.services.realtime.min_instances
  max_instances         = var.services.realtime.max_instances
  concurrency           = var.services.realtime.concurrency
  timeout_seconds       = 3600 # Cloud Run corta el WebSocket a los 60 min y socket.io reconecta solo
  session_affinity      = true # socket.io con long-polling: todas las peticiones de una sesión a la misma instancia
  ingress               = local.ingress
  deletion_protection   = var.deletion_protection

  # Direct VPC egress solo a rangos privados: Memorystore (y Cloud SQL) por Private Services Access; internet directo.
  vpc = merge(local.vpc_base, { egress = "PRIVATE_RANGES_ONLY" })

  # /healthz no toca la base ni Redis: sirve para el arranque y la vida (también en MODE=realtime).
  startup_probe = { type = "http", path = "/healthz" }
  liveness_path = "/healthz"

  env        = local.realtime_env
  secret_env = local.mounted_secrets["realtime"]

  depends_on = [module.secrets]
}

# Migraciones dentro de la VPC (Cloud SQL solo tiene IP privada). Cloud Build lo ejecuta con
# `gcloud run jobs execute` después de cambiar la imagen. Terraform ignora la imagen.
resource "google_cloud_run_v2_job" "migrate" {
  count               = var.stages.cloud_sql ? 1 : 0
  project             = var.project_id
  name                = "${local.prefix}-db-migrate"
  location            = var.region
  labels              = merge(local.labels, { servicio = "db-migrate" })
  deletion_protection = var.deletion_protection

  template {
    task_count  = 1
    parallelism = 1

    template {
      service_account = module.iam.emails["migrator"]
      timeout         = "1800s"
      max_retries     = 0

      vpc_access {
        egress = "PRIVATE_RANGES_ONLY"
        network_interfaces {
          network    = module.network.network_id
          subnetwork = module.network.subnet_id
          tags       = local.run_tags
        }
      }

      containers {
        image   = "us-docker.pkg.dev/cloudrun/container/job"
        command = var.migrate_job.command
        args    = var.migrate_job.args

        env {
          name  = "CLOUD_SQL_CONNECTION_NAME"
          value = module.cloud_sql[0].connection_name
        }
        env {
          name  = "DB_NAME"
          value = module.cloud_sql[0].database_name
        }
        env {
          name  = "DB_IAM_USER"
          value = module.cloud_sql[0].iam_db_users["migrator"]
        }
        env {
          name  = "MIRAI_ENV"
          value = local.env
        }

        resources {
          limits = {
            cpu    = "1"
            memory = "512Mi"
          }
        }
      }
    }
  }

  lifecycle {
    ignore_changes = [client, client_version, template[0].template[0].containers[0].image]
  }
}
