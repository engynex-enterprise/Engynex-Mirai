# Red privada de un ambiente de Mirai en Azure.
# - VNet con tres subredes: aca (entorno de Container Apps con perfiles de carga, delegada a Microsoft.App/environments),
#   postgres (delegada a Flexible Server) y private-endpoints (Redis y lo que se agregue por Private Link).
# - NAT Gateway con IP pública fija en la subred de ACA: salida a internet (IA, pasarelas, Meta, Telegram).
# - Zonas DNS privadas de Postgres y Redis enlazadas a la VNet (private_services).
# Reparto del cidr: si el prefijo es /21 o mayor → aca /23, postgres /24, private-endpoints /24; si es más chico,
# aca = la mitad y las otras dos un cuarto cada una (el entorno con perfiles de carga admite subredes desde /27).
# Se ignoran: zones (los servicios de Azure de este stack son regionales) y flow_logs (los flujos de VNet necesitan
# Network Watcher y una cuenta de almacenamiento: se activan a mano si hace falta diagnosticar).
# context.cloud: resource_group_name (obligatorio).

locals {
  rg       = var.context.cloud["resource_group_name"]
  location = var.context.region
  bits     = tonumber(split("/", var.cidr)[1])
  big      = local.bits <= 21

  subnets = {
    aca               = local.big ? cidrsubnet(var.cidr, 23 - local.bits, 0) : cidrsubnet(var.cidr, 1, 0)
    postgres          = local.big ? cidrsubnet(var.cidr, 24 - local.bits, 2) : cidrsubnet(var.cidr, 2, 2)
    private-endpoints = local.big ? cidrsubnet(var.cidr, 24 - local.bits, 3) : cidrsubnet(var.cidr, 2, 3)
  }

  nat_ips = var.nat ? max(1, var.nat_static_ip_count) : 0

  # La zona de Flexible Server debe terminar en .postgres.database.azure.com; la de Redis es la de Private Link.
  dns_zones = var.private_services ? {
    postgres = "${var.context.prefix}.private.postgres.database.azure.com"
    redis    = "privatelink.redis.cache.windows.net"
  } : {}
}

resource "azurerm_virtual_network" "this" {
  name                = "${var.context.prefix}-vnet"
  resource_group_name = local.rg
  location            = local.location
  address_space       = [var.cidr]
  tags                = var.context.labels
}

resource "azurerm_subnet" "aca" {
  name                            = "aca"
  resource_group_name             = local.rg
  virtual_network_name            = azurerm_virtual_network.this.name
  address_prefixes                = [local.subnets.aca]
  default_outbound_access_enabled = false

  delegation {
    name = "containerapps"
    service_delegation {
      name    = "Microsoft.App/environments"
      actions = ["Microsoft.Network/virtualNetworks/subnets/join/action"]
    }
  }
}

resource "azurerm_subnet" "postgres" {
  name                            = "postgres"
  resource_group_name             = local.rg
  virtual_network_name            = azurerm_virtual_network.this.name
  address_prefixes                = [local.subnets.postgres]
  default_outbound_access_enabled = false

  delegation {
    name = "flexibleserver"
    service_delegation {
      name    = "Microsoft.DBforPostgreSQL/flexibleServers"
      actions = ["Microsoft.Network/virtualNetworks/subnets/join/action"]
    }
  }
}

resource "azurerm_subnet" "private_endpoints" {
  name                              = "private-endpoints"
  resource_group_name               = local.rg
  virtual_network_name              = azurerm_virtual_network.this.name
  address_prefixes                  = [local.subnets.private-endpoints]
  default_outbound_access_enabled   = false
  private_endpoint_network_policies = "Disabled"
}

# ── Salida a internet ──────────────────────────────────────────────────────────────────────────────────────────
resource "azurerm_public_ip" "nat" {
  count               = local.nat_ips
  name                = "${var.context.prefix}-nat-${count.index}"
  resource_group_name = local.rg
  location            = local.location
  allocation_method   = "Static"
  sku                 = "Standard"
  tags                = var.context.labels
}

resource "azurerm_nat_gateway" "this" {
  count                   = var.nat ? 1 : 0
  name                    = "${var.context.prefix}-nat"
  resource_group_name     = local.rg
  location                = local.location
  sku_name                = "Standard"
  idle_timeout_in_minutes = 10
  tags                    = var.context.labels
}

resource "azurerm_nat_gateway_public_ip_association" "this" {
  count                = local.nat_ips
  nat_gateway_id       = azurerm_nat_gateway.this[0].id
  public_ip_address_id = azurerm_public_ip.nat[count.index].id
}

resource "azurerm_subnet_nat_gateway_association" "aca" {
  count          = var.nat ? 1 : 0
  subnet_id      = azurerm_subnet.aca.id
  nat_gateway_id = azurerm_nat_gateway.this[0].id
}

# ── DNS privado ────────────────────────────────────────────────────────────────────────────────────────────────
resource "azurerm_private_dns_zone" "this" {
  for_each            = local.dns_zones
  name                = each.value
  resource_group_name = local.rg
  tags                = var.context.labels
}

resource "azurerm_private_dns_zone_virtual_network_link" "this" {
  for_each             = local.dns_zones
  name                 = "${var.context.prefix}-${each.key}"
  private_dns_zone_id  = azurerm_private_dns_zone.this[each.key].id
  virtual_network_id   = azurerm_virtual_network.this.id
  registration_enabled = false
  tags                 = var.context.labels
}
