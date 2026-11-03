# Ambiente de PRUEBAS (rama `pruebas`). Tamaños mínimos: escala a cero, base sin HA, cron en pausa mientras la base
# de Supabase sea compartida con producción (si no, los avisos saldrían dos veces).

module "mirai" {
  source = "../../stack"
  providers = {
    google      = google
    google.cicd = google.cicd
  }

  environment     = "pruebas"
  project_id      = var.project_id
  cicd_project_id = var.cicd_project_id
  region          = var.region
  bucket_suffix   = var.bucket_suffix
  domains         = var.domains
  stages          = var.stages
  public_config   = var.public_config
  api_env         = var.api_env
  db_adapter      = var.db_adapter

  scheduler_dry_run = var.scheduler_dry_run

  optional_secrets    = var.optional_secrets
  alert_emails        = var.alert_emails
  deletion_protection = false
  lb_log_sample_rate  = 1.0

  network = {
    subnet_cidr         = "10.10.0.0/24"
    nat_static_ip_count = var.nat_static_ip_count
  }

  services = {
    web      = { min_instances = 0, max_instances = 3 }
    api      = { min_instances = 0, max_instances = 3 }
    realtime = { min_instances = 0, max_instances = 1, cpu_always_on = false } # 1 instancia: sin Redis (adaptador en memoria)
  }

  cloud_sql = {
    tier                   = "db-g1-small" # núcleo compartido, sin SLA: suficiente para pruebas
    high_availability      = false
    disk_size_gb           = 10
    backup_retention_count = 7
    pitr_days              = 3
    max_connections        = 100
    iam_users              = var.cloud_sql_iam_users
  }

  redis = { tier = "BASIC", memory_size_gb = 1 }

  armor = {
    waf_preview           = true
    rate_limit_per_minute = 2000 # las E2E de Playwright corren desde una sola IP
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
    branch_regex           = "^pruebas$"
    approval_required      = false
    canary_steps           = "50"
    bake_seconds           = 120
  }

  identity_platform = {
    google_client_id = var.google_client_id
  }
}
