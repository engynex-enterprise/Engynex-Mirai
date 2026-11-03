# Ambiente de PRODUCCIÓN en Azure (rama `main`, https://mirai.engynex.com). Una réplica mínima por servicio, Postgres
# con HA por zonas, Redis Standard, entorno de Container Apps repartido en zonas, protección contra borrado y WAF en
# Detection al inicio (pasar a Prevention tras 2 semanas revisando los registros, runbook §6).

module "mirai" {
  source = "../../stack"

  environment = "produccion"
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
    zone_redundant        = true
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

  deletion_protection = true
  log_sample_rate     = 0.5

  network = {
    cidr                = "10.40.0.0/16"
    nat_static_ip_count = var.nat_static_ip_count
  }

  services = {
    web       = { cpu = "1", min_instances = 1, max_instances = 20 }
    api       = { cpu = "1", min_instances = 1, max_instances = 20 }
    realtime  = { cpu = "1", min_instances = 1, max_instances = 6 }
    worker    = { cpu = "0.5", min_instances = 1, max_instances = 3 }
    postgrest = { cpu = "0.5", min_instances = 1, max_instances = 3 }
  }

  postgres = {
    size              = "m" # GP_Standard_D2ds_v5: 2 vCPU, 8 GB
    high_availability = true
    storage_gb        = 64
    backup_days       = 30
    max_connections   = 200
  }

  redis = { high_availability = true, memory_gb = 1 }

  waf = {
    waf_preview = true # Detection; pasar a false (Prevention) tras revisar los registros del WAF
  }

  budget = {
    amount        = var.budget_amount
    billing_scope = var.billing_scope
  }
}
