# Entorno de Container Apps (perfiles de carga, perfil Consumption) en la subred aca + Log Analytics.
# cloud_options:
#   internal       (bool, false) → balanceador interno. false = las apps con ingress externo tienen FQDN público y
#                  Front Door llega por internet (las apps validan la sesión y el WAF va en Front Door). true = todo
#                  privado y Front Door Premium llega por Private Link (edge.cloud_options.private_link = true; la
#                  conexión del private endpoint se aprueba una vez con
#                  `az network private-endpoint-connection approve`).
#   zone_redundant (bool, false) → réplicas repartidas en zonas (producción).
# context.cloud: resource_group_name.

locals {
  rg             = var.context.cloud["resource_group_name"]
  internal       = try(var.cloud_options.internal, false)
  zone_redundant = try(var.cloud_options.zone_redundant, false)
}

resource "azurerm_log_analytics_workspace" "this" {
  name                = "${var.context.prefix}-logs"
  resource_group_name = local.rg
  location            = var.context.region
  sku                 = "PerGB2018"
  retention_in_days   = max(30, var.log_retention_days)
  tags                = var.context.labels
}

resource "azurerm_container_app_environment" "this" {
  name                           = "${var.context.prefix}-aca"
  resource_group_name            = local.rg
  location                       = var.context.region
  infrastructure_subnet_id       = var.network.subnet_ids.aca
  internal_load_balancer_enabled = local.internal
  zone_redundancy_enabled        = local.zone_redundant
  logs_destination               = "log-analytics"
  log_analytics_workspace_id     = azurerm_log_analytics_workspace.this.id
  tags                           = var.context.labels

  workload_profile {
    name                  = "Consumption"
    workload_profile_type = "Consumption"
  }

  lifecycle {
    # Azure crea solo el grupo de recursos de infraestructura (ME_…); no se gestiona aquí.
    ignore_changes = [infrastructure_resource_group_name]
  }
}
