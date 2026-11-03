module "network" {
  source                  = "../modules/network"
  project_id              = var.project_id
  name                    = local.prefix
  region                  = var.region
  subnet_cidr             = var.network.subnet_cidr
  enable_private_services = local.private_services
  enable_nat              = true # la web sale por la VPC (ALL_TRAFFIC) para llamar a la API por la red interna
  nat_static_ip_count     = var.network.nat_static_ip_count
  flow_logs               = var.network.flow_logs
}
