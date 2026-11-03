# Key Vault con autorización RBAC: un secreto por clave del catálogo.
# - Los valores que genera la infraestructura (generated_values: URL de la base y de Redis, secretos internos) los
#   escribe Terraform y los mantiene.
# - Los demás (ENCRYPTION_KEY, CRON_SECRET, pasarelas…) se cargan aparte (az keyvault secret set, runbook): Key Vault no
#   tiene "secreto sin versión", así que Terraform crea cada uno con el marcador REEMPLAZA y luego ignora el valor
#   (ignore_changes). Ojo: a diferencia de GCP, una app que monte un secreto aún en REEMPLAZA arranca con ese valor:
#   carga los obligatorios antes del primer despliegue.
# - Cada accessor recibe Key Vault Secrets User sobre SU secreto (no sobre todo el almacén). Quien aplica Terraform
#   recibe Key Vault Secrets Officer para escribir los valores.
# - Acceso público de red abierto (Terraform y GitHub Actions escriben por el plano de datos; las apps leen con su
#   identidad). Para cerrarlo: cloud_options.network_default_action = "Deny" + un runner dentro de la VNet.
# cloud_options: vault_name (≤ 24), purge_protection (bool; por defecto solo en producción), network_default_action.
# context.cloud: resource_group_name, subscription_id, tenant_id.

data "azurerm_client_config" "current" {}

locals {
  rg      = var.context.cloud["resource_group_name"]
  is_prod = var.context.environment == "produccion"
  hash    = substr(md5("${var.context.cloud["subscription_id"]}/${local.rg}"), 0, 5)
  name    = try(var.cloud_options.vault_name, "${substr(var.context.prefix, 0, 17)}-${local.hash}")

  generated_keys = nonsensitive(toset(keys(var.generated_values)))
  manual_keys    = setsubtract(toset(keys(var.secrets)), local.generated_keys)

  accessor_bindings = merge([
    for s, cfg in var.secrets : { for k, p in cfg.accessors : "${s}/${k}" => { secret = s, principal = p } }
  ]...)

  versionless = merge(
    { for k, s in azurerm_key_vault_secret.manual : k => s.versionless_id },
    { for k, s in azurerm_key_vault_secret.generated : k => s.versionless_id },
  )
  resource_ids = merge(
    { for k, s in azurerm_key_vault_secret.manual : k => s.resource_versionless_id },
    { for k, s in azurerm_key_vault_secret.generated : k => s.resource_versionless_id },
  )
}

resource "azurerm_key_vault" "this" {
  name                          = local.name
  resource_group_name           = local.rg
  location                      = var.context.region
  tenant_id                     = var.context.cloud["tenant_id"]
  sku_name                      = "standard"
  rbac_authorization_enabled    = true
  purge_protection_enabled      = try(var.cloud_options.purge_protection, local.is_prod)
  soft_delete_retention_days    = local.is_prod ? 90 : 7
  public_network_access_enabled = true
  tags                          = var.context.labels

  network_acls {
    bypass         = "AzureServices"
    default_action = try(var.cloud_options.network_default_action, "Allow")
  }
}

resource "azurerm_role_assignment" "terraform" {
  scope                = azurerm_key_vault.this.id
  role_definition_name = "Key Vault Secrets Officer"
  principal_id         = data.azurerm_client_config.current.object_id
}

resource "azurerm_key_vault_secret" "manual" {
  for_each     = local.manual_keys
  name         = each.key
  key_vault_id = azurerm_key_vault.this.id
  value        = "REEMPLAZA"
  content_type = substr(var.secrets[each.key].description, 0, 250)
  tags         = merge(var.context.labels, var.secrets[each.key].labels, { secreto = each.key, origen = "manual" })

  lifecycle {
    ignore_changes = [value, content_type]
  }

  depends_on = [azurerm_role_assignment.terraform]
}

resource "azurerm_key_vault_secret" "generated" {
  for_each     = local.generated_keys
  name         = each.key
  key_vault_id = azurerm_key_vault.this.id
  value        = var.generated_values[each.key]
  content_type = substr(var.secrets[each.key].description, 0, 250)
  tags         = merge(var.context.labels, var.secrets[each.key].labels, { secreto = each.key, origen = "terraform" })

  depends_on = [azurerm_role_assignment.terraform]
}

resource "azurerm_role_assignment" "accessors" {
  for_each             = local.accessor_bindings
  scope                = local.resource_ids[each.value.secret]
  role_definition_name = "Key Vault Secrets User"
  principal_id         = each.value.principal
  principal_type       = "ServicePrincipal"
}
