# Stack de un ambiente de Mirai en Azure. Lo usan clouds/azure/envs/{pruebas,produccion}.
# Variables comunes que en Azure se ignoran o cambian de sentido (ver los main.tf de capabilities/*/azure):
#   network.zones (servicios regionales), network.flow_logs, postgres.iam_users (sin IAM para Postgres),
#   postgres.storage_gb (sube al escalón de Azure), redis.tls (siempre TLS), log_sample_rate, budget.currency,
#   waf.waf_sensitivity y waf.adaptive_protection (sin equivalente en Front Door), services.*.memory (Consumption exige
#   memoria = 2 × CPU), services.*.timeout (Container Apps y Front Door cortan a los 240 s), services.realtime.cpu_always_on.
#   Los dominios canary.* no van al borde: el canario en Azure usa la etiqueta de revisión
#   (https://<app>---canary.<dominio del entorno>).

locals {
  env     = var.environment
  is_prod = var.environment == "produccion"
  prefix  = "mirai-${var.environment}"
  rg_name = coalesce(var.azure.resource_group_name, "${local.prefix}-rg")
  f       = var.features

  labels = merge(var.labels, {
    app            = "mirai"
    ambiente       = var.environment
    gestionado-por = "terraform"
  })

  rg_id = var.azure.create_resource_group ? azurerm_resource_group.this[0].id : data.azurerm_resource_group.this[0].id

  context = {
    prefix      = local.prefix
    environment = var.environment
    region      = var.region
    labels      = local.labels
    cloud = {
      resource_group_name = local.rg_name
      resource_group_id   = local.rg_id
      subscription_id     = var.azure.subscription_id
      tenant_id           = var.azure.tenant_id
    }
  }

  names = { for k in ["web", "api", "realtime", "worker", "postgrest"] : k => "${local.prefix}-${k}" }

  domain       = module.platform.internal_domain
  internal_url = { for k, n in local.names : k => "https://${n}.internal.${local.domain}" }

  git_branch = local.is_prod ? "main" : "pruebas"

  registry_server = var.azure.registry_server
  acr_name        = local.registry_server == null ? "" : split(".", local.registry_server)[0]
}

resource "azurerm_resource_group" "this" {
  count    = var.azure.create_resource_group ? 1 : 0
  name     = local.rg_name
  location = var.region
  tags     = local.labels
}

data "azurerm_resource_group" "this" {
  count = var.azure.create_resource_group ? 0 : 1
  name  = local.rg_name
}

check "worker_para_las_colas" {
  assert {
    condition     = var.azure.queue_driver == "servicebus" ? var.features.worker : !var.features.worker
    error_message = "Con Service Bus (cola de extracción) hace falta features.worker = true; con queue_driver = http no hay worker (MODE=worker exige sqs o servicebus)."
  }
}
