# Memorystore for Redis: adaptador de socket.io (@socket.io/redis-adapter) y presencia del gateway `realtime`.
# Solo se crea en la etapa 3 (cuando el gateway reemplaza a Supabase Realtime). Siempre con AUTH; TLS según var.tls
# (ver la variable: el cliente de la API hoy solo recibe REDIS_URL y no puede confiar en la CA propia de Memorystore).

resource "google_redis_instance" "this" {
  project                 = var.project_id
  region                  = var.region
  name                    = var.name
  display_name            = "Mirai ${var.name}"
  tier                    = var.tier
  memory_size_gb          = var.memory_size_gb
  redis_version           = var.redis_version
  authorized_network      = var.authorized_network
  connect_mode            = "PRIVATE_SERVICE_ACCESS"
  reserved_ip_range       = var.reserved_ip_range
  auth_enabled            = true
  transit_encryption_mode = var.tls ? "SERVER_AUTHENTICATION" : "DISABLED"
  labels                  = var.labels

  redis_configs = {
    "maxmemory-policy"       = "volatile-lru"
    "notify-keyspace-events" = ""
  }

  maintenance_policy {
    weekly_maintenance_window {
      day = "SUNDAY"
      start_time {
        hours   = 9 # 4:00 a. m. en Colombia
        minutes = 0
      }
    }
  }
}
