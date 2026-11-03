module "network" {
  source              = "../../../capabilities/network/gcp"
  context             = local.context
  cidr                = var.network.cidr
  zones               = var.network.zones
  private_services    = local.f.postgres || local.f.redis
  nat                 = true # la web sale por la VPC (ALL_TRAFFIC) para llamar a la API por la red interna
  nat_static_ip_count = var.network.nat_static_ip_count
  flow_logs           = var.network.flow_logs
}

module "platform" {
  source  = "../../../capabilities/container-platform/gcp"
  context = local.context
  network = module.network.network
}
