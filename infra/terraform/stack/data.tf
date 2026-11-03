# Datos administrados: Cloud Storage (etapa 2), Cloud SQL y Memorystore (etapa 3).

module "storage" {
  count      = var.stages.storage ? 1 : 0
  source     = "../modules/storage"
  project_id = var.project_id
  location   = upper(var.region)
  labels     = local.labels

  buckets = {
    private = {
      name          = "${local.prefix}-private-${var.bucket_suffix}"
      cors_origins  = local.web_origins
      force_destroy = !var.deletion_protection
      object_admins = { api = module.iam.members["api"] }
      lifecycle = [
        { prefix = "tmp/", age_days = 1 }, # subidas para la IA que nunca se usaron
      ]
    }
    backups = {
      name                = "${local.prefix}-backups-${var.bucket_suffix}"
      versioning          = true
      noncurrent_ttl_days = 30
      soft_delete_days    = 14
      cors_origins        = local.web_origins
      cors_methods        = ["GET", "HEAD"]
      force_destroy       = !var.deletion_protection
      object_admins       = { api = module.iam.members["api"] }
      lifecycle = [
        { prefix = "exports/", age_days = 7 }, # exportaciones (Ley 1581, CSV/JSON): se descargan con URL firmada
      ]
    }
    public = {
      name          = "${local.prefix}-public-${var.bucket_suffix}"
      public_read   = true
      cors_origins  = local.web_origins
      cors_methods  = ["GET", "HEAD", "PUT"]
      force_destroy = !var.deletion_protection
      object_admins = { api = module.iam.members["api"] }
    }
  }
}

module "cloud_sql" {
  count                  = var.stages.cloud_sql ? 1 : 0
  source                 = "../modules/cloud-sql"
  project_id             = var.project_id
  region                 = var.region
  name                   = "${local.prefix}-pg"
  labels                 = local.labels
  database_version       = var.cloud_sql.database_version
  edition                = var.cloud_sql.edition
  tier                   = var.cloud_sql.tier
  high_availability      = var.cloud_sql.high_availability
  disk_size_gb           = var.cloud_sql.disk_size_gb
  backup_retention_count = var.cloud_sql.backup_retention_count
  pitr_days              = var.cloud_sql.pitr_days
  max_connections        = var.cloud_sql.max_connections
  private_network        = module.network.network_self_link
  allocated_ip_range     = module.network.private_services_range_name
  deletion_protection    = var.deletion_protection
  iam_users              = var.cloud_sql.iam_users

  iam_service_accounts = {
    api      = module.iam.emails["api"]
    realtime = module.iam.emails["realtime"]
    migrator = module.iam.emails["migrator"]
  }

  depends_on = [module.network]
}

module "redis" {
  count              = var.stages.redis ? 1 : 0
  source             = "../modules/redis"
  project_id         = var.project_id
  region             = var.region
  name               = "${local.prefix}-redis"
  labels             = local.labels
  tier               = var.redis.tier
  memory_size_gb     = var.redis.memory_size_gb
  authorized_network = module.network.network_id
  reserved_ip_range  = module.network.private_services_range_name

  depends_on = [module.network]
}
