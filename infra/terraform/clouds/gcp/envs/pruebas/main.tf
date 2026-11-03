# Ambiente de PRUEBAS en GCP (rama `pruebas`). Tamaños mínimos: escala a cero, Cloud SQL propia sin HA (resuelve la
# base compartida, riesgo R1 de F2-H), cron en pausa hasta que pruebas deje de compartir datos con producción.
# Las mismas variables de la app sirven para clouds/aws y clouds/azure (docs/infra/cambiar-de-nube.md).

module "mirai" {
  source = "../../stack"
  providers = {
    google      = google
    google.cicd = google.cicd
  }

  environment       = "pruebas"
  project_id        = var.project_id
  cicd_project_id   = var.cicd_project_id
  region            = var.region
  bucket_suffix     = var.bucket_suffix
  domains           = var.domains
  same_origin       = var.same_origin
  features          = var.features
  auth_provider     = var.auth_provider
  db_adapter        = var.db_adapter
  live_source       = var.live_source
  images            = var.images
  public_config     = var.public_config
  api_env           = var.api_env
  realtime_env      = var.realtime_env
  worker_env        = var.worker_env
  web_env           = var.web_env
  extra_web_origins = var.extra_web_origins
  optional_secrets  = var.optional_secrets
  scheduler_dry_run = var.scheduler_dry_run
  alert_emails      = var.alert_emails

  deletion_protection = false
  log_sample_rate     = 1.0

  network = {
    cidr                = "10.10.0.0/24"
    nat_static_ip_count = var.nat_static_ip_count
  }

  services = {
    web       = { min_instances = 0, max_instances = 3 }
    api       = { min_instances = 0, max_instances = 3 }
    realtime  = { min_instances = 0, max_instances = 1, cpu_always_on = false } # sin Redis (memoria) y escala a cero; para un ensayo real: min 1 + cpu_always_on
    worker    = { min_instances = 0, max_instances = 1 }
    postgrest = { min_instances = 0, max_instances = 2 }
  }

  postgres = {
    size            = "xs" # db-g1-small: núcleo compartido, sin SLA, suficiente para pruebas
    storage_gb      = 10
    backup_days     = 7
    pitr_days       = 3
    max_connections = 100
    iam_users       = var.cloud_sql_iam_users
  }

  redis = { high_availability = false, memory_gb = 1 }

  waf = {
    waf_preview           = true
    rate_limit_per_minute = 2000 # las E2E de Playwright corren desde una sola IP
  }

  budget = {
    billing_scope = var.billing_account
    amount        = var.budget_amount
    currency      = var.budget_currency
  }

  gcp = {
    vertex_ai = var.vertex_ai
    identity_platform = {
      google_client_id = var.google_client_id
    }
    github_actions = var.workload_identity_pool == null ? null : {
      workload_identity_pool = var.workload_identity_pool
      environment            = "pruebas"
    }
  }

  cicd = {
    artifact_registry_path = var.artifact_registry_path
    artifact_registry_repo = var.artifact_registry_repo
    location               = var.region
    repository_id          = var.cloudbuild_repository_id
    smoke_tests            = var.smoke_tests
    branch_regex           = "^pruebas$"
    approval_required      = false
    canary_steps           = "50"
    bake_seconds           = 120
  }
}
