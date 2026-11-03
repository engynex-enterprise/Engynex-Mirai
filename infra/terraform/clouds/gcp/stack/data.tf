# Datos administrados: Cloud Storage, Cloud SQL (base principal desde v7) y Memorystore.

locals {
  bucket_writers = { api = module.iam.principals["api"] }
}

module "storage" {
  count   = local.f.storage ? 1 : 0
  source  = "../../../capabilities/object-storage/gcp"
  context = local.context

  buckets = {
    private = {
      name          = "${local.prefix}-private-${var.bucket_suffix}"
      cors_origins  = local.web_origins
      force_destroy = !var.deletion_protection
      writers       = local.bucket_writers
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
      writers             = local.bucket_writers
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
      writers       = local.bucket_writers
    }
  }
}

module "cloud_sql" {
  count               = local.f.postgres ? 1 : 0
  source              = "../../../capabilities/postgres/gcp"
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
  iam_users           = var.postgres.iam_users
  deletion_protection = var.deletion_protection

  # Usuarios con contraseña (DATABASE_URL portable): la app y, con PostgREST, el rol authenticator. El administrador
  # mirai_admin lo crea siempre la capacidad (database-admin-url). Grants y membresías: línea base SQL (V7-C).
  app_users = merge({ app = "mirai_app" }, local.f.postgrest ? { postgrest = "authenticator" } : {})

  iam_identities = {
    api      = module.iam.ids["api"]
    realtime = module.iam.ids["realtime"]
    migrator = module.iam.ids["migrator"]
  }

  cloud_options = merge(
    { edition = var.gcp.cloud_sql_edition },
    var.postgres.tier != null ? { tier = var.postgres.tier } : {},
  )
}

module "redis" {
  count             = local.f.redis ? 1 : 0
  source            = "../../../capabilities/redis/gcp"
  context           = local.context
  network           = module.network.network
  name              = "${local.prefix}-redis"
  high_availability = var.redis.high_availability
  memory_gb         = var.redis.memory_gb
  tls               = var.redis.tls
}
