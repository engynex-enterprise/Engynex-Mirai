# Ambiente de PRODUCCIÓN en GCP (rama `main`, https://mirai.engynex.com). Una instancia mínima por servicio, Cloud SQL
# con HA regional, despliegue con aprobación (entorno produccion de GitHub) y canario 10 % → 50 % → 100 %.
# Las mismas variables de la app sirven para clouds/aws y clouds/azure (docs/infra/cambiar-de-nube.md).

module "mirai" {
  source = "../../stack"
  providers = {
    google      = google
    google.cicd = google.cicd
  }

  environment       = "produccion"
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

  deletion_protection = true
  log_sample_rate     = 0.5

  network = {
    cidr                = "10.20.0.0/24"
    nat_static_ip_count = var.nat_static_ip_count
  }

  services = {
    web       = { min_instances = 1, max_instances = 20, memory = "1Gi" }
    api       = { min_instances = 1, max_instances = 20, memory = "1Gi" }
    realtime  = { min_instances = 1, max_instances = 6, cpu_always_on = true }
    worker    = { min_instances = 1, max_instances = 3 }
    postgrest = { min_instances = 1, max_instances = 4 }
  }

  postgres = {
    size              = "m" # db-custom-2-7680: 2 vCPU, 7,5 GB
    high_availability = true
    storage_gb        = 20
    backup_days       = 30
    pitr_days         = 7
    max_connections   = 200
    iam_users         = var.cloud_sql_iam_users
  }

  redis = { high_availability = false, memory_gb = 1 } # BASIC: Redis solo guarda presencia y el pub/sub de socket.io

  waf = {
    waf_preview = true # pasar a false tras 2 semanas revisando los registros de Cloud Armor (runbook §6)
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
      environment            = "produccion"
    }
  }

  cicd = {
    artifact_registry_path = var.artifact_registry_path
    artifact_registry_repo = var.artifact_registry_repo
    location               = var.region
    repository_id          = var.cloudbuild_repository_id
    smoke_tests            = var.smoke_tests
    branch_regex           = "^main$"
    approval_required      = true
    canary_steps           = "10,50"
    bake_seconds           = 300
  }
}
