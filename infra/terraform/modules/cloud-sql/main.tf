# Cloud SQL para PostgreSQL (fase 3 de la migración: reemplaza la base de Supabase).
# - Solo IP privada (Private Services Access), TLS obligatorio y autenticación IAM: sin contraseñas en Terraform.
# - Copias diarias + PITR; HA regional opcional (producción).
# - El esquema `auth` de compatibilidad, los roles anon/authenticated/service_role y el dueño mirai_owner se
#   crean con SQL (docs/arquitectura/v6-separacion-front-back.md §5.2), no aquí.

resource "google_sql_database_instance" "this" {
  project             = var.project_id
  name                = var.name
  region              = var.region
  database_version    = var.database_version
  deletion_protection = var.deletion_protection

  settings {
    edition                     = var.edition
    tier                        = var.tier
    availability_type           = var.high_availability ? "REGIONAL" : "ZONAL"
    disk_type                   = "PD_SSD"
    disk_size                   = var.disk_size_gb
    disk_autoresize             = true
    disk_autoresize_limit       = var.disk_autoresize_limit_gb
    deletion_protection_enabled = var.deletion_protection
    retain_backups_on_delete    = true
    user_labels                 = var.labels

    ip_configuration {
      ipv4_enabled                                  = false
      private_network                               = var.private_network
      allocated_ip_range                            = var.allocated_ip_range
      ssl_mode                                      = "ENCRYPTED_ONLY"
      enable_private_path_for_google_cloud_services = true
    }

    backup_configuration {
      enabled                        = true
      start_time                     = var.backup_start_time
      location                       = var.backup_location
      point_in_time_recovery_enabled = true
      transaction_log_retention_days = var.pitr_days

      backup_retention_settings {
        retained_backups = var.backup_retention_count
        retention_unit   = "COUNT"
      }
    }

    maintenance_window {
      day          = var.maintenance_day
      hour         = var.maintenance_hour_utc
      update_track = "stable"
    }

    insights_config {
      query_insights_enabled  = true
      query_string_length     = 1024
      record_application_tags = true
      record_client_address   = false
    }

    password_validation_policy {
      enable_password_policy      = true
      min_length                  = 16
      complexity                  = "COMPLEXITY_DEFAULT"
      disallow_username_substring = true
    }

    database_flags {
      name  = "cloudsql.iam_authentication"
      value = "on"
    }

    database_flags {
      name  = "log_min_duration_statement"
      value = "1000" # consultas de más de 1 s quedan en Cloud Logging (sin parámetros)
    }

    database_flags {
      name  = "log_lock_waits"
      value = "on"
    }

    dynamic "database_flags" {
      for_each = var.logical_decoding ? [1] : []
      content {
        name  = "cloudsql.logical_decoding"
        value = "on"
      }
    }

    dynamic "database_flags" {
      for_each = var.max_connections == null ? [] : [var.max_connections]
      content {
        name  = "max_connections"
        value = tostring(database_flags.value)
      }
    }

    dynamic "connection_pool_config" {
      for_each = var.managed_connection_pooling ? [1] : []
      content {
        connection_pooling_enabled = true
        flags {
          name  = "pool_mode"
          value = "transaction"
        }
      }
    }
  }
}

resource "google_sql_database" "app" {
  project  = var.project_id
  instance = google_sql_database_instance.this.name
  name     = var.database_name
}

# Usuarios IAM: el nombre es el correo sin ".gserviceaccount.com". Los permisos (grant) se dan con SQL.
resource "google_sql_user" "service_accounts" {
  for_each = var.iam_service_accounts
  project  = var.project_id
  instance = google_sql_database_instance.this.name
  name     = trimsuffix(each.value, ".gserviceaccount.com")
  type     = "CLOUD_IAM_SERVICE_ACCOUNT"
}

resource "google_sql_user" "people" {
  for_each = var.iam_users
  project  = var.project_id
  instance = google_sql_database_instance.this.name
  name     = each.value
  type     = "CLOUD_IAM_USER"
}
