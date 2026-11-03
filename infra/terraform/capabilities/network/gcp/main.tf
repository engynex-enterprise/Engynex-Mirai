# network (GCP): envuelve modules/network (VPC, subred de Cloud Run con Direct VPC egress, Private Services Access,
# Cloud NAT). `zones` no aplica (Cloud Run es regional). cloud_options: private_services_prefix_length (20).

module "this" {
  source                         = "../../../modules/network"
  project_id                     = var.context.cloud.project_id
  name                           = var.context.prefix
  region                         = var.context.region
  subnet_cidr                    = var.cidr
  enable_private_services        = var.private_services
  private_services_prefix_length = try(var.cloud_options.private_services_prefix_length, 20)
  enable_nat                     = var.nat
  nat_static_ip_count            = var.nat_static_ip_count
  flow_logs                      = var.flow_logs
}
