# Ambiente de PRUEBAS en Azure (rama `pruebas`). Tamaños mínimos: Postgres B1ms sin HA, Redis Basic (si se enciende),
# escala a cero donde se puede, sin protección contra borrado y WAF en Detection.

module "mirai" {
  source = "../../stack"

  environment = "pruebas"
  region      = var.region

  azure = {
    subscription_id       = var.subscription_id
    tenant_id             = var.tenant_id
    resource_group_name   = var.resource_group_name
    create_resource_group = var.create_resource_group
    registry_server       = var.registry_server
    registry_id           = var.registry_id
    queue_driver          = var.queue_driver
    key_vault_name        = var.key_vault_name
    servicebus_namespace  = var.servicebus_namespace
    storage_account_names = var.storage_account_names
  }

  bucket_suffix     = var.bucket_suffix
  domains           = var.domains
  features          = var.features
  same_origin       = var.same_origin
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

  deletion_protection = false
  log_sample_rate     = 1.0

  network = {
    cidr                = "10.30.0.0/16"
    nat_static_ip_count = var.nat_static_ip_count
  }

  services = {
    web       = { cpu = "0.5", min_instances = 0, max_instances = 3 }
    api       = { cpu = "0.5", min_instances = 0, max_instances = 3 }
    realtime  = { cpu = "0.5", min_instances = 0, max_instances = 1 }
    worker    = { cpu = "0.25", min_instances = 1, max_instances = 1 }
    postgrest = { cpu = "0.25", min_instances = 0, max_instances = 1 }
  }

  postgres = {
    size        = "xs" # B_Standard_B1ms: núcleo compartido, sin SLA, suficiente para pruebas
    storage_gb  = 32
    backup_days = 7
  }

  redis = { high_availability = false, memory_gb = 1 }

  waf = {
    waf_preview           = true
    rate_limit_per_minute = 2000 # las E2E de Playwright corren desde una sola IP
  }

  budget = {
    amount        = var.budget_amount
    billing_scope = var.billing_scope
  }
}
