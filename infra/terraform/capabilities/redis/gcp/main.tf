# redis (GCP): Memorystore for Redis (envuelve modules/redis), con AUTH y por Private Services Access.
# cloud_options: redis_version ("REDIS_7_2").

module "this" {
  source             = "../../../modules/redis"
  project_id         = var.context.cloud.project_id
  region             = var.context.region
  name               = var.name
  labels             = var.context.labels
  tier               = var.high_availability ? "STANDARD_HA" : "BASIC"
  memory_size_gb     = var.memory_gb
  redis_version      = try(var.cloud_options.redis_version, "REDIS_7_2")
  tls                = var.tls
  authorized_network = var.network.network_id
  reserved_ip_range  = var.network.private_services_range_name
}
