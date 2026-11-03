# Azure Database for PostgreSQL Flexible Server: acceso privado por la subred delegada y la zona DNS privada, TLS
# obligatorio, copias diarias con PITR y HA por zonas opcional.
# Tamaños (size → SKU): xs → B_Standard_B1ms (1 vCPU, 2 GB, solo pruebas), s → B_Standard_B2s (2 vCPU, 4 GB),
# m → GP_Standard_D2ds_v5 (2 vCPU, 8 GB), l → GP_Standard_D4ds_v5 (4 vCPU, 16 GB). Burstable no admite HA: con
# high_availability se sube a GP_Standard_D2ds_v5 como mínimo. cloud_options.tier pisa el SKU.
# Disco: el primer tamaño permitido ≥ storage_gb (32, 64, 128… GB) con crecimiento automático (storage_max_gb no
# aplica: Azure crece en escalones). PITR: Azure restaura a cualquier punto dentro de backup_days (pitr_days se
# ignora).
# Usuarios: Terraform genera la clave del administrador y de cada app_users, pero Flexible Server no tiene API para
# crear roles: los crea la línea base SQL (V7-C) con esas claves; el stack de Azure las pasa al trabajo db-migrate.
# iam_identities e iam_users se ignoran (autenticación de Entra para Postgres queda como mejora).
# cloud_options: tier (string), zone ("1"), standby_zone ("2"), extensions (lista, por defecto PGCRYPTO),
#   geo_redundant_backup (bool, false).
# context.cloud: resource_group_name.

locals {
  rg = var.context.cloud["resource_group_name"]

  sku_by_size = {
    xs = "B_Standard_B1ms"
    s  = "B_Standard_B2s"
    m  = "GP_Standard_D2ds_v5"
    l  = "GP_Standard_D4ds_v5"
  }
  base_sku = try(var.cloud_options.tier, local.sku_by_size[var.size])
  sku      = var.high_availability && startswith(local.base_sku, "B_") ? "GP_Standard_D2ds_v5" : local.base_sku

  storage_steps_gb = [32, 64, 128, 256, 512, 1024, 2048, 4096]
  storage_gb       = [for s in local.storage_steps_gb : s if s >= var.storage_gb][0]

  extensions = try(var.cloud_options.extensions, ["PGCRYPTO"])
  admin_user = "mirai_admin"

  configs = merge(
    {
      "require_secure_transport"   = "on"
      "azure.extensions"           = join(",", local.extensions)
      "log_min_duration_statement" = "1000"
      "log_lock_waits"             = "on"
    },
    var.max_connections == null ? {} : { "max_connections" = tostring(var.max_connections) },
  )
}

resource "random_password" "admin" {
  length  = 40
  special = false
}

resource "random_password" "users" {
  for_each = var.app_users
  length   = 40
  special  = false
}

resource "azurerm_postgresql_flexible_server" "this" {
  name                          = var.name
  resource_group_name           = local.rg
  location                      = var.context.region
  version                       = tostring(var.engine_version)
  sku_name                      = local.sku
  storage_mb                    = local.storage_gb * 1024
  auto_grow_enabled             = true
  backup_retention_days         = var.backup_days
  geo_redundant_backup_enabled  = try(var.cloud_options.geo_redundant_backup, false)
  delegated_subnet_id           = var.network.subnet_ids.postgres
  private_dns_zone_id           = var.network.private_dns_zone_ids.postgres
  public_network_access_enabled = false
  administrator_login           = local.admin_user
  administrator_password        = random_password.admin.result
  zone                          = try(var.cloud_options.zone, "1")
  tags                          = var.context.labels

  authentication {
    password_auth_enabled         = true
    active_directory_auth_enabled = false
  }

  dynamic "high_availability" {
    for_each = var.high_availability ? [1] : []
    content {
      mode                      = "ZoneRedundant"
      standby_availability_zone = try(var.cloud_options.standby_zone, "2")
    }
  }

  maintenance_window {
    day_of_week  = 0 # domingo
    start_hour   = 9 # 4:00 a. m. en Colombia
    start_minute = 0
  }

  lifecycle {
    # Azure puede intercambiar las zonas tras una conmutación por error.
    ignore_changes = [zone, high_availability[0].standby_availability_zone]
  }
}

resource "azurerm_postgresql_flexible_server_configuration" "this" {
  for_each  = local.configs
  name      = each.key
  server_id = azurerm_postgresql_flexible_server.this.id
  value     = each.value
}

resource "azurerm_postgresql_flexible_server_database" "app" {
  name      = var.database_name
  server_id = azurerm_postgresql_flexible_server.this.id
  charset   = "UTF8"
  collation = "en_US.utf8"
}

resource "azurerm_management_lock" "this" {
  count      = var.deletion_protection ? 1 : 0
  name       = "${var.name}-no-borrar"
  scope      = azurerm_postgresql_flexible_server.this.id
  lock_level = "CanNotDelete"
  notes      = "Protección contra borrado (Terraform: deletion_protection)."
}

locals {
  host = azurerm_postgresql_flexible_server.this.fqdn
  urls = {
    for k, role in var.app_users :
    k => "postgres://${role}:${random_password.users[k].result}@${local.host}:5432/${var.database_name}?sslmode=require"
  }
}
