# Una identidad administrada asignada por el usuario por servicio (sin llaves: Container Apps la usa para leer Key
# Vault, bajar imágenes de ACR, firmar SAS de Blob y hablar con Service Bus; la app la toma con
# DefaultAzureCredential y AZURE_CLIENT_ID).
# Permisos abstractos → roles de Azure sobre el grupo de recursos del ambiente:
#   ai → Cognitive Services OpenAI User (Azure OpenAI); metrics → Monitoring Metrics Publisher.
#   logs, traces, errors: no hacen falta (Container Apps manda stdout a Log Analytics). sql: Flexible Server usa
#   usuarios con contraseña (Entra para Postgres queda como mejora). idp: no aplica (no hay IdP administrado).
# context.cloud: resource_group_name, subscription_id (y opcional resource_group_id).

locals {
  rg    = var.context.cloud["resource_group_name"]
  rg_id = lookup(var.context.cloud, "resource_group_id", "/subscriptions/${var.context.cloud["subscription_id"]}/resourceGroups/${local.rg}")

  role_by_capability = {
    ai      = "Cognitive Services OpenAI User"
    metrics = "Monitoring Metrics Publisher"
  }

  assignments = merge([
    for k, v in var.identities : {
      for c in v.capabilities : "${k}/${c}" => { identity = k, role = local.role_by_capability[c] }
      if contains(keys(local.role_by_capability), c)
    }
  ]...)
}

resource "azurerm_user_assigned_identity" "this" {
  for_each            = var.identities
  name                = "${var.context.prefix}-${each.key}"
  resource_group_name = local.rg
  location            = var.context.region
  tags                = merge(var.context.labels, { servicio = each.key })
}

resource "azurerm_role_assignment" "this" {
  for_each             = local.assignments
  scope                = local.rg_id
  role_definition_name = each.value.role
  principal_id         = azurerm_user_assigned_identity.this[each.value.identity].principal_id
  principal_type       = "ServicePrincipal"
}
