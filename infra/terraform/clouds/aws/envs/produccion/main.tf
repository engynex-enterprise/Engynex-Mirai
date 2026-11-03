# Ambiente de PRODUCCIÓN en AWS (rama `main`). RDS Multi-AZ, un NAT por zona, mínimo 1 tarea por servicio (2 en web y
# api para repartir entre zonas), WAF en vista previa las primeras 2 semanas y protección de borrado.

module "mirai" {
  source = "../../stack"
  providers = {
    aws           = aws
    aws.us_east_1 = aws.us_east_1
  }

  environment       = "produccion"
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

  deletion_protection = true
  log_sample_rate     = 0.5

  network = { cidr = "10.40.0.0/16", zones = 2 }

  services = {
    web       = { cpu = "1", memory = "2Gi", min_instances = 2, max_instances = 20 }
    api       = { cpu = "1", memory = "2Gi", min_instances = 2, max_instances = 20 }
    realtime  = { cpu = "0.5", memory = "1Gi", min_instances = 1, max_instances = 6 }
    worker    = { cpu = "0.5", memory = "1Gi", min_instances = 1, max_instances = 4 }
    postgrest = { cpu = "0.5", memory = "1Gi", min_instances = 1, max_instances = 4 }
  }

  postgres = { size = "m", high_availability = true, storage_gb = 20, backup_days = 30, max_connections = 200 }
  redis    = { high_availability = true, memory_gb = 1 }

  waf = {
    waf_preview = true # pasar a false tras 2 semanas revisando los registros de AWS WAF
  }

  budget = { amount = var.budget_amount }

  aws = {
    registry_url  = var.registry_url
    nat_per_zone  = true
    queue_enabled = var.queue_enabled
  }
}
