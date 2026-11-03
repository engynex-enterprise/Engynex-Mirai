# Datos administrados: S3, RDS y ElastiCache.

module "storage" {
  count   = var.features.storage ? 1 : 0
  source  = "../../../capabilities/object-storage/aws"
  context = local.context

  buckets = {
    private = {
      name          = "${local.prefix}-private-${var.bucket_suffix}"
      cors_origins  = module.app.web_origins
      force_destroy = !var.deletion_protection
      writers       = { api = module.identity.principals["api"], worker = module.identity.principals["worker"] }
      lifecycle     = [{ prefix = "tmp/", age_days = 1 }]
    }
    backups = {
      name                = "${local.prefix}-backups-${var.bucket_suffix}"
      versioning          = true
      noncurrent_ttl_days = 30
      soft_delete_days    = 14
      cors_origins        = module.app.web_origins
      cors_methods        = ["GET", "HEAD"]
      force_destroy       = !var.deletion_protection
      writers             = { api = module.identity.principals["api"], worker = module.identity.principals["worker"] }
      lifecycle           = [{ prefix = "exports/", age_days = 7 }]
    }
    public = {
      name          = "${local.prefix}-public-${var.bucket_suffix}"
      public_read   = true
      cors_origins  = module.app.web_origins
      cors_methods  = ["GET", "HEAD", "PUT"]
      force_destroy = !var.deletion_protection
      writers       = { api = module.identity.principals["api"], worker = module.identity.principals["worker"] }
    }
  }
}

module "postgres" {
  count               = var.features.postgres ? 1 : 0
  source              = "../../../capabilities/postgres/aws"
  context             = local.context
  network             = module.network.network
  name                = "${local.prefix}-pg"
  engine_version      = var.postgres.engine_version
  size                = var.postgres.size
  high_availability   = var.postgres.high_availability
  storage_gb          = var.postgres.storage_gb
  backup_days         = var.postgres.backup_days
  pitr_days           = var.postgres.pitr_days
  max_connections     = var.postgres.max_connections
  deletion_protection = var.deletion_protection

  # Roles con contraseña (los crea la línea base SQL desde db-migrate con estas mismas contraseñas).
  app_users = merge({ app = "mirai_app" }, var.features.postgrest ? { postgrest = "authenticator" } : {})

  cloud_options = var.postgres.tier == null ? {} : { tier = var.postgres.tier }
}

module "redis" {
  count             = var.features.redis ? 1 : 0
  source            = "../../../capabilities/redis/aws"
  context           = local.context
  network           = module.network.network
  name              = "${local.prefix}-redis"
  high_availability = var.redis.high_availability
  memory_gb         = var.redis.memory_gb
  tls               = true
}
