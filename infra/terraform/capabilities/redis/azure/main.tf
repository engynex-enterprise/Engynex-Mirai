# Azure Cache for Redis: adaptador de socket.io y presencia del gateway. Solo TLS (6380), sin acceso público, con
# private endpoint en la subred private-endpoints y la zona DNS privada de la red.
# Nivel: Basic (una réplica, sin SLA) o Standard (réplica con conmutación) según high_availability. Tamaño: el primer
# C0–C6 con memoria ≥ memory_gb (0,25 / 1 / 2,5 / 6 / 13 / 26 / 53 GB). `tls` se ignora: Azure siempre usa TLS con CA
# pública, así que REDIS_URL es rediss://.
# Ojo: Microsoft anunció el retiro de Azure Cache for Redis a favor de Azure Managed Redis (azurerm_managed_redis);
# el contrato es el mismo y se puede cambiar el recurso sin tocar el stack.
# cloud_options: redis_version ("6").
# context.cloud: resource_group_name.

locals {
  rg       = var.context.cloud["resource_group_name"]
  sizes    = [0.25, 1, 2.5, 6, 13, 26, 53]
  capacity = min(6, length([for s in local.sizes : s if s < var.memory_gb]))
}

resource "azurerm_redis_cache" "this" {
  name                          = var.name
  resource_group_name           = local.rg
  location                      = var.context.region
  sku_name                      = var.high_availability ? "Standard" : "Basic"
  family                        = "C"
  capacity                      = local.capacity
  redis_version                 = try(var.cloud_options.redis_version, "6")
  minimum_tls_version           = "1.2"
  non_ssl_port_enabled          = false
  public_network_access_enabled = false
  tags                          = var.context.labels

  redis_configuration {
    maxmemory_policy = "volatile-lru"
  }

  patch_schedule {
    day_of_week    = "Sunday"
    start_hour_utc = 9 # 4:00 a. m. en Colombia
  }
}

resource "azurerm_private_endpoint" "this" {
  name                = "${var.name}-pe"
  resource_group_name = local.rg
  location            = var.context.region
  subnet_id           = var.network.subnet_ids.private_endpoints
  tags                = var.context.labels

  private_service_connection {
    name                           = "${var.name}-psc"
    private_connection_resource_id = azurerm_redis_cache.this.id
    subresource_names              = ["redisCache"]
    is_manual_connection           = false
  }

  private_dns_zone_group {
    name                 = "redis"
    private_dns_zone_ids = [var.network.private_dns_zone_ids.redis]
  }
}
