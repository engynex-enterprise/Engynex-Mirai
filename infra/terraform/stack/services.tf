# Servicios de Cloud Run: web (Next.js standalone), api (NestJS) y realtime (socket.io, etapa 3).
# Nombres de variables de la API: contrato propuesto para apps/api (@nestjs/config con zod). Si la API usa otros
# nombres, se ajustan aquí o se agregan con var.api_env.

locals {
  vpc_base = {
    network    = module.network.network_id
    subnetwork = module.network.subnet_id
    tags       = local.run_tags
  }

  api_env = merge(
    {
      MODE                     = "api"
      MIRAI_ENV                = local.env
      NODE_ENV                 = "production"
      GCP_PROJECT_ID           = var.project_id
      GCP_REGION               = var.region
      SUPABASE_URL             = lookup(var.public_config, "NEXT_PUBLIC_SUPABASE_URL", "")
      SUPABASE_PUBLISHABLE_KEY = lookup(var.public_config, "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "")
      SITE_URL                 = local.web_origin
      WEB_ORIGINS              = join(",", local.web_origins)
      API_PUBLIC_URL           = local.api_origin
      JOBS_OIDC_AUDIENCE       = local.run_url.api
      JOBS_INVOKER_EMAILS      = join(",", [module.iam.emails["scheduler"], module.iam.emails["tasks"]])
      TASKS_LOCATION           = var.region
      TASKS_INVOKER_SA         = module.iam.emails["tasks"]
      TASKS_TARGET_BASE_URL    = local.run_url.api
      TASKS_QUEUE_NOTIFY       = module.tasks.queue_names["notify"]
      TASKS_QUEUE_AUTOMATIONS  = module.tasks.queue_names["automations"]
      TASKS_QUEUE_SLOW         = module.tasks.queue_names["slow"]
      DB_ADAPTER               = var.db_adapter
      GOOGLE_CLIENT_ID         = lookup(var.public_config, "GOOGLE_CLIENT_ID", "")
      VAPID_PUBLIC_KEY         = lookup(var.public_config, "NEXT_PUBLIC_VAPID_PUBLIC_KEY", "")
      VAPID_SUBJECT            = lookup(var.public_config, "VAPID_SUBJECT", "")
      UPSTASH_REDIS_REST_URL   = lookup(var.public_config, "UPSTASH_REDIS_REST_URL", "")
      SENTRY_DSN               = lookup(var.public_config, "NEXT_PUBLIC_SENTRY_DSN", "")
      LOG_LEVEL                = local.is_prod ? "info" : "debug"
    },
    var.stages.storage ? {
      STORAGE_BUCKET_PRIVATE = module.storage[0].names["private"]
      STORAGE_BUCKET_PUBLIC  = module.storage[0].names["public"]
      STORAGE_BUCKET_BACKUPS = module.storage[0].names["backups"]
      PUBLIC_FILES_URL       = local.files_origin
    } : {},
    var.stages.cloud_sql ? {
      CLOUD_SQL_CONNECTION_NAME = module.cloud_sql[0].connection_name
      DB_NAME                   = module.cloud_sql[0].database_name
      DB_IAM_USER               = module.cloud_sql[0].iam_db_users["api"]
    } : {},
    var.stages.redis ? {
      REDIS_HOST = module.redis[0].host
      REDIS_PORT = tostring(module.redis[0].port)
      REDIS_TLS  = "true"
    } : {},
    var.api_env,
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

  env = merge(var.public_config, {
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
  session_affinity      = true
  ingress               = local.ingress
  deletion_protection   = var.deletion_protection
  vpc                   = merge(local.vpc_base, { egress = "PRIVATE_RANGES_ONLY" })

  env        = merge(local.api_env, { MODE = "realtime" })
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
