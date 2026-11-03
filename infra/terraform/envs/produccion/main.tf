# Ambiente de PRODUCCIÓN (rama `main`, https://mirai.engynex.com). Una instancia mínima por servicio, base con HA
# regional, despliegue con aprobación manual y canario 10 % → 50 % → 100 %.

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
  stages            = var.stages
  public_config     = var.public_config
  api_env           = var.api_env
  realtime_env      = var.realtime_env
  extra_web_origins = var.extra_web_origins
  live_source       = var.live_source
  db_adapter        = var.db_adapter

  scheduler_dry_run = var.scheduler_dry_run

  optional_secrets    = var.optional_secrets
  alert_emails        = var.alert_emails
  deletion_protection = true
  lb_log_sample_rate  = 0.5

  network = {
    subnet_cidr         = "10.20.0.0/24"
    nat_static_ip_count = var.nat_static_ip_count
  }

  services = {
    web      = { min_instances = 1, max_instances = 20, memory = "1Gi" }
    api      = { min_instances = 1, max_instances = 20, memory = "1Gi" }
    realtime = { min_instances = 1, max_instances = 6, cpu_always_on = true }
  }

  cloud_sql = {
    tier                   = "db-custom-2-7680" # 2 vCPU, 7,5 GB
    high_availability      = true
    disk_size_gb           = 20
    backup_retention_count = 30
    pitr_days              = 7
    max_connections        = 200
    iam_users              = var.cloud_sql_iam_users
  }

  redis = { tier = "BASIC", memory_size_gb = 1 }

  armor = {
    waf_preview = true # pasar a false tras 2 semanas revisando los registros de Cloud Armor (runbook §6)
  }

  budget = {
    billing_account = var.billing_account
    amount          = var.budget_amount
    currency_code   = var.budget_currency
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

  identity_platform = {
    google_client_id = var.google_client_id
  }
}
