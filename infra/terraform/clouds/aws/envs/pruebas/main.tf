# Ambiente de PRUEBAS en AWS (rama `pruebas`). Tamaños mínimos: un NAT, RDS sin Multi-AZ (db.t4g.micro), una tarea
# por servicio, sin protección de borrado. Mismas variables de la app que GCP (clouds/aws/stack/variables-comunes.tf).

module "mirai" {
  source = "../../stack"
  providers = {
    aws           = aws
    aws.us_east_1 = aws.us_east_1
  }

  environment       = "pruebas"
  region            = var.region
  bucket_suffix     = var.bucket_suffix
  domains           = var.domains
  features          = var.features
  auth_provider     = var.auth_provider
  db_adapter        = var.db_adapter
  live_source       = var.live_source
  public_config     = var.public_config
  api_env           = var.api_env
  realtime_env      = var.realtime_env
  worker_env        = var.worker_env
  web_env           = var.web_env
  extra_web_origins = var.extra_web_origins
  optional_secrets  = var.optional_secrets
  images            = var.images
  scheduler_dry_run = var.scheduler_dry_run
  alert_emails      = var.alert_emails
  dns               = var.dns

  deletion_protection = false
  log_sample_rate     = 1.0

  network = { cidr = "10.30.0.0/16", zones = 2 }

  services = {
    web       = { cpu = "0.5", memory = "1Gi", min_instances = 1, max_instances = 3 }
    api       = { cpu = "0.5", memory = "1Gi", min_instances = 1, max_instances = 3 }
    realtime  = { cpu = "0.25", memory = "512Mi", min_instances = 1, max_instances = 1 }
    worker    = { cpu = "0.25", memory = "512Mi", min_instances = 1, max_instances = 2 }
    postgrest = { cpu = "0.25", memory = "512Mi", min_instances = 1, max_instances = 1 }
  }

  postgres = { size = "xs", high_availability = false, storage_gb = 20, backup_days = 7 }
  redis    = { high_availability = false, memory_gb = 1 }

  waf = {
    waf_preview           = true
    rate_limit_per_minute = 2000 # las E2E de Playwright corren desde una sola IP
  }

  budget = { amount = var.budget_amount }

  aws = {
    registry_url  = var.registry_url
    nat_per_zone  = false
    queue_enabled = var.queue_enabled
    fargate_spot  = true
  }
}
