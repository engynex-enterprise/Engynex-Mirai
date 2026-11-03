# Composición de un ambiente de Mirai en GCP. La usan envs/pruebas y envs/produccion con valores distintos.

variable "environment" {
  description = "Ambiente: pruebas o produccion."
  type        = string
  validation {
    condition     = contains(["pruebas", "produccion"], var.environment)
    error_message = "environment debe ser pruebas o produccion."
  }
}

variable "project_id" {
  description = "Proyecto de GCP del ambiente."
  type        = string
  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{4,28}[a-z0-9]$", var.project_id))
    error_message = "ID de proyecto no válido."
  }
}

variable "cicd_project_id" {
  description = "Proyecto compartido de CI/CD (Artifact Registry, Cloud Build, estado de Terraform)."
  type        = string
}

variable "region" {
  description = "Región de todo el ambiente. us-west1 (Oregón) mientras la base siga en Supabase us-west-2 (ver docs/infra/estrategia-gcp.md §3)."
  type        = string
  default     = "us-west1"
  validation {
    condition     = contains(["us-west1", "us-central1", "us-east1", "us-east4", "us-south1", "southamerica-east1"], var.region)
    error_message = "Región no contemplada en la estrategia (us-west1, us-central1, us-east1, us-east4, us-south1, southamerica-east1)."
  }
}

variable "labels" {
  description = "Etiquetas extra (se suman a app, ambiente y gestionado-por)."
  type        = map(string)
  default     = {}
}

variable "domains" {
  description = "Dominios del ambiente (sin https://) y del certificado."
  type = object({
    web                       = string
    api                       = string
    realtime                  = string
    files                     = string
    canary_web                = string
    canary_api                = string
    certificate               = list(string)
    dns_authorization_domains = list(string)
  })
  validation {
    condition = alltrue([
      for d in [var.domains.web, var.domains.api, var.domains.realtime, var.domains.files, var.domains.canary_web, var.domains.canary_api] :
      can(regex("^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$", d))
    ])
    error_message = "Cada dominio va sin https:// ni barra final, en minúsculas."
  }
}

variable "stages" {
  description = <<-EOT
    Qué está encendido según la etapa de la migración (docs/infra/estrategia-gcp.md §7):
    etapa 1 → load_balancer; etapa 2 → storage, scheduler_paused = false; etapa 3 → cloud_sql, redis, realtime;
    etapa 4 → identity_platform. uptime_checks se enciende cuando el DNS ya apunta al balanceador.
  EOT
  type = object({
    load_balancer     = optional(bool, true)
    storage           = optional(bool, true)
    cloud_sql         = optional(bool, false)
    redis             = optional(bool, false)
    realtime          = optional(bool, false)
    identity_platform = optional(bool, false)
    scheduler_paused  = optional(bool, true)
    uptime_checks     = optional(bool, false)
  })
  default = {}
  validation {
    condition     = !var.stages.realtime || var.stages.redis || var.services.realtime.max_instances == 1
    error_message = "realtime con más de una instancia necesita redis (adaptador de socket.io). Sin redis, usa services.realtime.max_instances = 1."
  }
}

variable "network" {
  description = "Red del ambiente."
  type = object({
    subnet_cidr         = optional(string, "10.10.0.0/24")
    nat_static_ip_count = optional(number, 0)
    flow_logs           = optional(bool, false)
  })
  default = {}
}

variable "services" {
  description = "Tamaño de los servicios de Cloud Run."
  type = object({
    web = optional(object({
      cpu           = optional(string, "1")
      memory        = optional(string, "1Gi")
      min_instances = optional(number, 0)
      max_instances = optional(number, 10)
      concurrency   = optional(number, 80)
      timeout       = optional(number, 300)
      latency_p95   = optional(number, 3000)
    }), {})
    api = optional(object({
      cpu           = optional(string, "1")
      memory        = optional(string, "1Gi")
      min_instances = optional(number, 0)
      max_instances = optional(number, 10)
      concurrency   = optional(number, 80)
      timeout       = optional(number, 300)
      latency_p95   = optional(number, 5000)
      vpc_egress    = optional(string, "PRIVATE_RANGES_ONLY")
      liveness_path = optional(string)
    }), {})
    realtime = optional(object({
      cpu           = optional(string, "1")
      memory        = optional(string, "512Mi")
      min_instances = optional(number, 1)
      max_instances = optional(number, 5)
      concurrency   = optional(number, 250)
      cpu_always_on = optional(bool, true)
    }), {})
  })
  default = {}
}

variable "public_config" {
  description = <<-EOT
    Configuración sin secretos (los NEXT_PUBLIC_* se incrustan en el build de la web y van al navegador).
    Claves esperadas: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, NEXT_PUBLIC_LEGAL_*, GOOGLE_CLIENT_ID,
    NEXT_PUBLIC_VAPID_PUBLIC_KEY, VAPID_SUBJECT, NEXT_PUBLIC_TURNSTILE_SITE_KEY, UPSTASH_REDIS_REST_URL,
    NEXT_PUBLIC_SENTRY_DSN, NEXT_PUBLIC_WOMPI_PUBLIC_KEY, NEXT_PUBLIC_ADSENSE_CLIENT, NEXT_PUBLIC_ADSENSE_SLOT, MIRAI_CSP_ENFORCE.
  EOT
  type        = map(string)
  validation {
    condition     = alltrue([for k in keys(var.public_config) : !can(regex("(SECRET|PASSWORD|PRIVATE|TOKEN)", k))])
    error_message = "public_config no admite secretos (SECRET, PASSWORD, PRIVATE, TOKEN): van en Secret Manager."
  }
  validation {
    condition     = contains(keys(var.public_config), "NEXT_PUBLIC_SUPABASE_URL") && contains(keys(var.public_config), "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY")
    error_message = "Faltan NEXT_PUBLIC_SUPABASE_URL o NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY."
  }
}

variable "api_env" {
  description = "Variables extra (sin secretos) para la API y el gateway, sin tocar el stack."
  type        = map(string)
  default     = {}
}

variable "db_adapter" {
  description = "Adaptador de datos de la API: supabase (hasta el corte de la etapa 3) o pg (Cloud SQL)."
  type        = string
  default     = "supabase"
  validation {
    condition     = contains(["supabase", "pg"], var.db_adapter)
    error_message = "db_adapter debe ser supabase o pg."
  }
}

variable "optional_secrets" {
  description = "Secretos opcionales que ya tienen valor cargado y se montan en los servicios (Cloud Run falla si un secreto montado no tiene versión)."
  type        = list(string)
  default     = []
  validation {
    condition = alltrue([for s in var.optional_secrets : contains([
      "google-client-secret", "google-oauth-state-key", "ai-gateway-api-key", "vapid-private-key", "upstash-redis-rest-token",
      "mercadopago-access-token", "mercadopago-webhook-secret", "wompi-integrity-secret", "wompi-events-secret", "supabase-jwt-secret",
    ], s)])
    error_message = "Secreto opcional desconocido (ver el catálogo en stack/secrets.tf)."
  }
}

variable "bucket_suffix" {
  description = "Sufijo para que los nombres de bucket sean únicos en el mundo (p. ej. engynex)."
  type        = string
  validation {
    condition     = can(regex("^[a-z0-9]{3,12}$", var.bucket_suffix))
    error_message = "3 a 12 minúsculas o números."
  }
}

variable "cloud_sql" {
  description = "Cloud SQL (etapa 3)."
  type = object({
    tier                   = optional(string, "db-custom-1-3840")
    edition                = optional(string, "ENTERPRISE")
    database_version       = optional(string, "POSTGRES_17")
    high_availability      = optional(bool, false)
    disk_size_gb           = optional(number, 20)
    backup_retention_count = optional(number, 14)
    pitr_days              = optional(number, 7)
    max_connections        = optional(number)
    iam_users              = optional(map(string), {})
  })
  default = {}
}

variable "redis" {
  description = "Memorystore Redis (etapa 3, con el gateway)."
  type = object({
    tier           = optional(string, "BASIC")
    memory_size_gb = optional(number, 1)
  })
  default = {}
}

variable "armor" {
  description = "Cloud Armor (ver modules/lb-https)."
  type = object({
    waf_preview                     = optional(bool, true)
    waf_sensitivity                 = optional(number, 1)
    rate_limit_per_minute           = optional(number, 1200)
    sensitive_rate_limit_per_minute = optional(number, 60)
    webhook_rate_limit_per_minute   = optional(number, 300)
    deny_ip_ranges                  = optional(list(string), [])
    allow_ip_ranges                 = optional(list(string), [])
    adaptive_protection             = optional(bool, false)
  })
  default = {}
}

variable "scheduler_dry_run" {
  description = "true = los trabajos de Scheduler mandan {\"dry\":true}: la API calcula y registra sin enviar (comparación con el cron actual antes del corte, etapa 2)."
  type        = bool
  default     = false
}

variable "lb_log_sample_rate" {
  description = "Fracción de peticiones del balanceador que quedan en Cloud Logging."
  type        = number
  default     = 1.0
  validation {
    condition     = var.lb_log_sample_rate >= 0 && var.lb_log_sample_rate <= 1
    error_message = "Entre 0 y 1."
  }
}

variable "alert_emails" {
  description = "Correos de alertas (clave fija → correo)."
  type        = map(string)
}

variable "budget" {
  description = "Presupuesto mensual del proyecto (billing_account null = sin presupuesto)."
  type = object({
    billing_account = optional(string)
    amount          = optional(number, 100)
    currency_code   = optional(string, "USD")
  })
  default = {}
}

variable "cicd" {
  description = "CI/CD: repositorio de Artifact Registry y disparadores de Cloud Build (repository_id null = sin disparadores)."
  validation {
    condition     = can(regex("^[a-z0-9-]+-docker\\.pkg\\.dev/[a-z0-9-]+/[a-z0-9-]+$", var.cicd.artifact_registry_path))
    error_message = "cicd.artifact_registry_path debe tener la forma <región>-docker.pkg.dev/<proyecto>/<repo>."
  }
  type = object({
    artifact_registry_path = string
    artifact_registry_repo = string
    location               = optional(string, "us-west1")
    repository_id          = optional(string)
    branch_regex           = string
    approval_required      = optional(bool, false)
    fail_on_severity       = optional(string, "CRITICAL")
    canary_steps           = optional(string, "10,50")
    bake_seconds           = optional(number, 300)
    max_5xx_ratio          = optional(string, "0.02")
    smoke_tests            = optional(bool, true) # false solo hasta que el certificado y los A de canary-* existan
  })
}

variable "identity_platform" {
  description = "Identity Platform (etapa 4)."
  type = object({
    google_client_id = optional(string)
    totp_mfa         = optional(bool, true)
  })
  default = {}
}

variable "migrate_job" {
  description = "Trabajo de Cloud Run que aplica las migraciones SQL dentro de la VPC (etapa 3). Usa la imagen de la API."
  type = object({
    command = optional(list(string), ["node"])
    args    = optional(list(string), ["packages/db/scripts/db-migrate.mjs"])
  })
  default = {}
}

variable "deletion_protection" {
  description = "Protección contra borrado de servicios, base y buckets."
  type        = bool
  default     = true
}
