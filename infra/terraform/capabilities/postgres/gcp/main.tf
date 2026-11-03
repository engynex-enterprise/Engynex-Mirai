# postgres (GCP): Cloud SQL para PostgreSQL (envuelve modules/cloud-sql): solo IP privada, TLS obligatorio, copias +
# PITR, HA regional opcional y autenticación IAM. Además crea usuarios con contraseña generada (app_users y el
# administrador mirai_admin) para que la conexión sea la misma en cualquier nube (DATABASE_URL). Los permisos y la
# membresía de roles (authenticated, service_role, authenticator) los da la línea base SQL (V7-C).
# cloud_options: tier (pisa size), edition (ENTERPRISE | ENTERPRISE_PLUS), logical_decoding (true),
#                managed_connection_pooling (false), backup_location ("us").

locals {
  tiers = {
    xs = "db-g1-small"      # núcleo compartido, sin SLA: solo pruebas
    s  = "db-custom-1-3840" # 1 vCPU, 3,75 GB
    m  = "db-custom-2-7680" # 2 vCPU, 7,5 GB
    l  = "db-custom-4-15360"
  }
  tier = try(var.cloud_options.tier, null) != null ? var.cloud_options.tier : local.tiers[var.size]

  users = merge(var.app_users, { admin = "mirai_admin" })
}

module "this" {
  source                     = "../../../modules/cloud-sql"
  project_id                 = var.context.cloud.project_id
  region                     = var.context.region
  name                       = var.name
  labels                     = var.context.labels
  database_version           = "POSTGRES_${var.engine_version}"
  edition                    = try(var.cloud_options.edition, "ENTERPRISE")
  tier                       = local.tier
  high_availability          = var.high_availability
  disk_size_gb               = var.storage_gb
  disk_autoresize_limit_gb   = var.storage_max_gb
  backup_retention_count     = var.backup_days
  pitr_days                  = var.pitr_days
  backup_location            = try(var.cloud_options.backup_location, "us")
  max_connections            = var.max_connections
  logical_decoding           = try(var.cloud_options.logical_decoding, true)
  managed_connection_pooling = try(var.cloud_options.managed_connection_pooling, false)
  database_name              = var.database_name
  private_network            = var.network.network_self_link
  allocated_ip_range         = var.network.private_services_range_name
  iam_service_accounts       = var.iam_identities
  iam_users                  = var.iam_users
  deletion_protection        = var.deletion_protection
}

resource "random_password" "users" {
  for_each = local.users
  length   = 40
  special  = false # va dentro de una URL de conexión
}

resource "google_sql_user" "passwords" {
  for_each        = local.users
  project         = var.context.cloud.project_id
  instance        = module.this.instance_name
  name            = each.value
  type            = "BUILT_IN"
  password        = random_password.users[each.key].result
  deletion_policy = "ABANDON" # el rol puede ser dueño de objetos: se borra a mano con SQL
}

locals {
  urls = {
    for k, u in local.users : k => "postgresql://${u}:${random_password.users[k].result}@${module.this.private_ip}:5432/${module.this.database_name}?sslmode=require"
  }
}
