# Servicios de Cloud Run (capacidad container-service): web (Next.js standalone), api (NestJS), realtime (socket.io)
# y postgrest (puente interno, D4). Sin worker: Cloud Tasks empuja las tareas a la API. Variables y secretos: capabilities/app-config (iguales en las
# tres nubes). La imagen y el tráfico los cambia el CI/CD (GitHub Actions o Cloud Build); Terraform los ignora.

locals {
  # Colector OpenTelemetry (V7-Q) como sidecar de la API y el gateway (los que exportan OTLP).
  otel_collector = local.f.otel ? {
    image  = var.images.otel_collector
    config = file("${path.module}/../../../../otel/collector.gcp.yaml")
  } : null

  # La API llega a PostgREST (ingress interno) por *.run.app: con PostgREST todo su tráfico sale por la VPC.
  api_egress = local.f.postgrest ? "ALL_TRAFFIC" : var.gcp.api_vpc_egress
}

module "web" {
  source              = "../../../capabilities/container-service/gcp"
  context             = merge(local.context, { labels = merge(local.labels, { servicio = "web" }) })
  platform            = module.platform.platform
  identity            = local.sa["web"]
  name                = local.names.web
  description         = "Mirai web (Next.js) · ${local.env}"
  image               = var.images.web
  cpu                 = var.services.web.cpu
  memory              = var.services.web.memory
  min_instances       = var.services.web.min_instances
  max_instances       = var.services.web.max_instances
  concurrency         = var.services.web.concurrency
  timeout_s           = var.services.web.timeout # /api/chat sigue en la web hasta que el chat pase a la API
  ingress             = local.ingress
  health_path         = "/api/public/version"
  probes              = { startup = "tcp", liveness = false }
  deletion_protection = var.deletion_protection

  # ALL_TRAFFIC: la web llama a la API por *.run.app como tráfico interno y sale a internet por Cloud NAT.
  cloud_options = { vpc_egress = "ALL_TRAFFIC" }

  env        = local.web_env
  secret_env = local.secret_env["web"]

  depends_on = [module.secrets]
}

module "api" {
  source              = "../../../capabilities/container-service/gcp"
  context             = merge(local.context, { labels = merge(local.labels, { servicio = "api" }) })
  platform            = module.platform.platform
  identity            = local.sa["api"]
  name                = local.names.api
  description         = "Mirai API (NestJS) · ${local.env}"
  image               = var.images.api
  cpu                 = var.services.api.cpu
  memory              = var.services.api.memory
  min_instances       = var.services.api.min_instances
  max_instances       = var.services.api.max_instances
  concurrency         = var.services.api.concurrency
  timeout_s           = var.services.api.timeout # chat NDJSON hasta 300 s
  ingress             = local.ingress
  health_path         = "/healthz"
  probes              = { startup = "tcp", liveness = true }
  deletion_protection = var.deletion_protection
  cloud_options       = { vpc_egress = local.api_egress, otel_collector = local.otel_collector }

  env        = local.api_env
  secret_env = local.secret_env["api"]

  # Scheduler y Tasks cuentan como tráfico interno; la API valida su token OIDC (SchedulerGuard).
  invokers = {
    scheduler = module.iam.principals["scheduler"]
    tasks     = module.iam.principals["tasks"]
  }

  depends_on = [module.secrets]
}

module "realtime" {
  count               = local.f.realtime ? 1 : 0
  source              = "../../../capabilities/container-service/gcp"
  context             = merge(local.context, { labels = merge(local.labels, { servicio = "realtime" }) })
  platform            = module.platform.platform
  identity            = local.sa["realtime"]
  name                = local.names.realtime
  description         = "Mirai realtime (socket.io) · ${local.env}"
  image               = var.images.api # misma imagen que la API con MODE=realtime
  cpu                 = var.services.realtime.cpu
  memory              = var.services.realtime.memory
  always_on_cpu       = var.services.realtime.cpu_always_on
  min_instances       = var.services.realtime.min_instances
  max_instances       = var.services.realtime.max_instances
  concurrency         = var.services.realtime.concurrency
  timeout_s           = 3600 # Cloud Run corta el WebSocket a los 60 min y socket.io reconecta solo
  session_affinity    = true # socket.io con long-polling: todas las peticiones de una sesión a la misma instancia
  ingress             = local.ingress
  health_path         = "/healthz" # no toca la base ni Redis: sirve para el arranque y la vida
  probes              = { startup = "http", liveness = true }
  deletion_protection = var.deletion_protection

  # Direct VPC egress solo a rangos privados: Memorystore y Cloud SQL por Private Services Access; internet directo.
  cloud_options = { vpc_egress = "PRIVATE_RANGES_ONLY", otel_collector = local.otel_collector }

  env        = local.realtime_env
  secret_env = local.secret_env["realtime"]

  depends_on = [module.secrets]
}

module "postgrest" {
  count               = local.f.postgrest ? 1 : 0
  source              = "../../../capabilities/container-service/gcp"
  context             = merge(local.context, { labels = merge(local.labels, { servicio = "postgrest" }) })
  platform            = module.platform.platform
  identity            = local.sa["postgrest"]
  name                = local.names.postgrest
  description         = "Mirai PostgREST interno (D4) · ${local.env}"
  image               = var.images.postgrest
  cpu                 = var.services.postgrest.cpu
  memory              = var.services.postgrest.memory
  min_instances       = local.is_prod ? max(1, var.services.postgrest.min_instances) : var.services.postgrest.min_instances
  max_instances       = var.services.postgrest.max_instances
  concurrency         = var.services.postgrest.concurrency
  timeout_s           = 60
  ingress             = "internal" # solo la VPC; la autorización es el JWT interno (PGRST_JWT_SECRET)
  health_path         = null
  probes              = { startup = "tcp", liveness = false }
  deletion_protection = var.deletion_protection
  cloud_options       = { vpc_egress = "PRIVATE_RANGES_ONLY" }

  env        = module.app.env.postgrest
  secret_env = local.secret_env["postgrest"]

  depends_on = [module.secrets]
}

# Migraciones dentro de la VPC (Cloud SQL solo tiene IP privada). El CI/CD lo ejecuta con
# `gcloud run jobs execute` después de cambiar la imagen. Terraform ignora la imagen.
resource "google_cloud_run_v2_job" "migrate" {
  count               = local.f.postgres ? 1 : 0
  project             = var.project_id
  name                = "${local.prefix}-db-migrate"
  location            = var.region
  labels              = merge(local.labels, { servicio = "db-migrate" })
  deletion_protection = var.deletion_protection

  template {
    task_count  = 1
    parallelism = 1

    template {
      service_account = local.sa["migrator"].email
      timeout         = "1800s"
      max_retries     = 0

      vpc_access {
        egress = "PRIVATE_RANGES_ONLY"
        network_interfaces {
          network    = module.network.network.network_id
          subnetwork = module.network.network.subnet_id
          tags       = module.platform.platform.tags
        }
      }

      containers {
        image   = "us-docker.pkg.dev/cloudrun/container/job"
        command = var.migrate_job.command
        args    = var.migrate_job.args

        dynamic "env" {
          for_each = module.app.env.migrate
          content {
            name  = env.key
            value = env.value
          }
        }

        # DATABASE_URL = usuario mirai_admin (dueño del esquema), generado por la infraestructura.
        dynamic "env" {
          for_each = local.secret_env["migrate"]
          content {
            name = env.key
            value_source {
              secret_key_ref {
                secret  = env.value
                version = "latest"
              }
            }
          }
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

  depends_on = [module.secrets]
}
