output "network" {
  description = "Handle de la red (Azure): VNet, subredes, zonas DNS privadas, ubicación y grupo de recursos."
  value = {
    vnet_id             = azurerm_virtual_network.this.id
    vnet_name           = azurerm_virtual_network.this.name
    resource_group_name = local.rg
    location            = local.location
    subnet_ids = {
      aca               = azurerm_subnet.aca.id
      postgres          = azurerm_subnet.postgres.id
      private_endpoints = azurerm_subnet.private_endpoints.id
    }
    private_dns_zone_ids = { for k, z in azurerm_private_dns_zone.this : k => z.id }
    # La zona de Postgres debe estar enlazada antes de crear el servidor.
    dns_links = [for l in azurerm_private_dns_zone_virtual_network_link.this : l.id]
  }
}

output "id" {
  description = "ID de la VNet."
  value       = azurerm_virtual_network.this.id
}

output "nat_ips" {
  description = "IP públicas de salida del NAT Gateway (las que se dan a una integración con lista blanca)."
  value       = azurerm_public_ip.nat[*].ip_address
}
