# Azure Container Registry compartido por los ambientes (vive en el grupo de CI/CD del bootstrap). Las imágenes van
# como <login_server>/<name>/<imagen> (mirai/web, mirai/api): `images` no crea repositorios (ACR los crea al publicar).
# - Sin usuario administrador: GitHub Actions publica con OIDC (AcrPush) y las apps bajan con su identidad (AcrPull).
# - Limpieza: en Premium, untagged_ttl_days borra los manifiestos sin etiqueta. keep_recent y tagged_ttl_days no tienen
#   recurso en Azure: se aplican con una tarea programada (`az acr task create … acr purge --filter 'mirai/.*:.*'
#   --ago <tagged_ttl_days>d --keep <keep_recent>`, runbook). cleanup_dry_run se ignora.
# cloud_options: registry_name (alfanumérico, 5–50, único en Azure; por defecto <name><hash>), sku (Standard | Premium).
# context.cloud: resource_group_name, subscription_id.

locals {
  rg   = var.context.cloud["resource_group_name"]
  hash = substr(md5(var.context.cloud["subscription_id"]), 0, 8)
  acr  = try(var.cloud_options.registry_name, "${replace(var.name, "-", "")}${local.hash}")
  sku  = try(var.cloud_options.sku, "Standard")

  bindings = merge(
    { for k, p in var.readers : "pull/${k}" => { principal = p, role = "AcrPull" } },
    { for k, p in var.writers : "push/${k}" => { principal = p, role = "AcrPush" } },
  )
}

resource "azurerm_container_registry" "this" {
  name                          = local.acr
  resource_group_name           = local.rg
  location                      = var.context.region
  sku                           = local.sku
  admin_enabled                 = false
  anonymous_pull_enabled        = false
  public_network_access_enabled = true
  retention_policy_in_days      = local.sku == "Premium" ? var.untagged_ttl_days : null
  tags                          = var.context.labels
}

resource "azurerm_role_assignment" "this" {
  for_each             = local.bindings
  scope                = azurerm_container_registry.this.id
  role_definition_name = each.value.role
  principal_id         = each.value.principal
}
