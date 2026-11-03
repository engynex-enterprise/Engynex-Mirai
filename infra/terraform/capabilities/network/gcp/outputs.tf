output "network" {
  description = "Handle de la red (GCP): ids de la VPC y la subred, rango de Private Services Access."
  value = {
    project_id                     = var.context.cloud.project_id
    region                         = var.context.region
    network_id                     = module.this.network_id
    network_name                   = module.this.network_name
    network_self_link              = module.this.network_self_link
    subnet_id                      = module.this.subnet_id
    subnet_name                    = module.this.subnet_name
    private_services_range_name    = module.this.private_services_range_name
    private_services_connection_id = module.this.private_services_connection_id
  }
}

output "id" {
  description = "ID de la VPC."
  value       = module.this.network_id
}

output "nat_ips" {
  description = "IP fijas de salida (vacío si son automáticas)."
  value       = module.this.nat_ips
}
