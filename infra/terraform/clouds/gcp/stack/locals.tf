# Regiones de GCP contempladas (D12: us-east1 desde el corte B; us-west1 mientras la base siga en Supabase us-west-2).
data "google_project" "this" {
  project_id = var.project_id

  lifecycle {
    precondition {
      condition     = contains(["us-east1", "us-east4", "us-central1", "us-west1", "us-south1", "southamerica-east1"], var.region)
      error_message = "Región no contemplada (us-east1, us-east4, us-central1, us-west1, us-south1, southamerica-east1)."
    }
    precondition {
      condition     = !var.features.worker
      error_message = "En GCP no hay worker: Cloud Tasks empuja las tareas a la API (MODE=worker solo consume SQS o Service Bus)."
    }
  }
}

locals {
  env     = var.environment
  is_prod = var.environment == "produccion"
  prefix  = "mirai-${var.environment}"
  f       = var.features

  labels = merge(var.labels, {
    app            = "mirai"
    ambiente       = var.environment
    gestionado-por = "terraform"
  })

  project_number = data.google_project.this.number

  context = {
    prefix      = local.prefix
    environment = local.env
    region      = var.region
    labels      = local.labels
    cloud       = { project_id = var.project_id, project_number = local.project_number }
  }

  names = {
    web       = "${local.prefix}-web"
    api       = "${local.prefix}-api"
    realtime  = "${local.prefix}-realtime"
    worker    = "${local.prefix}-worker"
    postgrest = "${local.prefix}-postgrest"
  }

  # URL determinista de Cloud Run (https://<servicio>-<número de proyecto>.<región>.run.app): se conoce antes de
  # crear el servicio, así la API usa su propia URL como audiencia OIDC sin ciclos.
  run_url = { for k, n in local.names : k => "https://${n}-${local.project_number}.${var.region}.run.app" }

  # Sin balanceador (pruebas sin dominio), los servicios quedan abiertos en *.run.app.
  ingress = local.f.edge ? "edge" : "public"

  vertex = var.gcp.vertex_ai

  git_branch = trim(var.cicd.branch_regex, "^$")

  # Lo que pone GCP en la configuración común (app-config): colas, cron, archivos e IA.
  gcp_api_env = merge(
    module.tasks.env,
    {
      # SchedulerGuard: token OIDC de Scheduler o de Tasks con audiencia = URL *.run.app de la API.
      SCHEDULER_AUDIENCE         = local.run_url.api
      SCHEDULER_SERVICE_ACCOUNTS = join(",", [module.iam.ids["scheduler"], module.iam.ids["tasks"]])
    },
    local.f.storage ? {
      OBJECT_STORE           = "gcs" # puerto ObjectStore (V7-E): URL firmadas V4 sin llaves
      STORAGE_BUCKET_PRIVATE = module.storage[0].bucket_names["private"]
      STORAGE_BUCKET_PUBLIC  = module.storage[0].bucket_names["public"]
      STORAGE_BUCKET_BACKUPS = module.storage[0].bucket_names["backups"]
    } : {},
    local.vertex ? {
      AI_PLATFORM_PROVIDER   = "vertex" # packages/ai: Vertex (Gemini con la cuenta del servicio) va primero en el respaldo
      GOOGLE_VERTEX_PROJECT  = var.project_id
      GOOGLE_VERTEX_LOCATION = var.gcp.vertex_location
    } : {},
  )
}

module "app" {
  source = "../../../capabilities/app-config"

  environment       = local.env
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
    vertex_ai = local.vertex
    otel      = local.f.otel
  }

  internal_urls = {
    api       = local.run_url.api # Cloud Tasks, Scheduler y la web (SSR) llaman por la URL interna, sin pasar por Armor
    postgrest = local.f.postgrest ? local.run_url.postgrest : null
  }

  cloud_env = {
    api    = local.gcp_api_env
    worker = local.gcp_api_env
    migrate = local.f.postgres ? {
      CLOUD_SQL_CONNECTION_NAME = module.cloud_sql[0].connection_name
      DB_NAME                   = module.cloud_sql[0].database
      DB_IAM_USER               = module.cloud_sql[0].iam_users["migrator"]
    } : {}
  }

  api_env      = var.api_env
  realtime_env = var.realtime_env
  worker_env   = var.worker_env
  web_env      = var.web_env
}

locals {
  api_env      = module.app.env.api
  realtime_env = module.app.env.realtime
  worker_env   = module.app.env.worker
  web_env      = module.app.env.web

  web_origins       = module.app.web_origins
  web_build_env     = module.app.web_build_env
  web_build_env_b64 = module.app.web_build_env_b64

  # Servicio → { VARIABLE → clave del secreto } y → { VARIABLE → secret_id } para Cloud Run.
  mounted_secrets = module.app.mounted_secrets
  secret_env      = { for svc, m in module.app.mounted_secrets : svc => { for e, k in m : e => module.secrets.refs[k] } }
}
