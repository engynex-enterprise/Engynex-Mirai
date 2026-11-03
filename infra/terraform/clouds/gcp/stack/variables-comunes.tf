# ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
# Variables COMUNES del stack de un ambiente. Este archivo es IDÉNTICO en clouds/{gcp,aws,azure}/stack (lo revisa
# infra/terraform/scripts/contrato.py): cambiar de nube = otra raíz con el mismo terraform.tfvars de la app y
# solo cambian las variables-<nube>.tf. Guía: docs/infra/cambiar-de-nube.md.
# ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────

variable "environment" {
  description = "Ambiente: pruebas o produccion."
  type        = string
  validation {
    condition     = contains(["pruebas", "produccion"], var.environment)
    error_message = "environment debe ser pruebas o produccion."
  }
}

variable "region" {
  description = "Región de la nube (GCP us-east1, AWS us-east-1, Azure eastus2…). D12: us-east1 desde el corte B (~55–70 ms desde Bogotá)."
  type        = string
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

variable "same_origin" {
  description = "Mismo origen (D2): /v1/*, /api/auth/* y /socket.io/* por el dominio de la web."
  type        = bool
  default     = true
}

variable "features" {
  description = <<-EOT
    Piezas encendidas. postgres = base de la nube como principal (v7). supabase = puente con Supabase del paso A
    (SUPABASE_URL + SUPABASE_SECRET_KEY). postgrest = puente interno (D4). worker = MODE=worker (consume colas
    de extracción: solo AWS con SQS y Azure con Service Bus; en GCP Cloud Tasks empuja). edge = borde público (balanceador/CDN/WAF).
    otel = colector OpenTelemetry como sidecar de cada servicio (infra/otel/collector.<nube>.yaml) y OTEL_* en la API.
    uptime_checks cuando el DNS ya apunte al borde.
  EOT
  type = object({
    edge             = optional(bool, true)
    storage          = optional(bool, true)
    postgres         = optional(bool, true)
    redis            = optional(bool, false)
    realtime         = optional(bool, false)
    postgrest        = optional(bool, false)
    worker           = optional(bool, false)
    supabase         = optional(bool, false)
    otel             = optional(bool, false)
    dns              = optional(bool, false)
    scheduler_paused = optional(bool, true)
    uptime_checks    = optional(bool, false)
  })
  default = {}
  validation {
    condition     = !var.features.realtime || var.features.redis || var.services.realtime.max_instances == 1
    error_message = "realtime con más de una instancia necesita redis (adaptador de socket.io). Sin redis, usa services.realtime.max_instances = 1."
  }
  validation {
    condition     = !var.features.postgrest || var.features.postgres
    error_message = "postgrest necesita la Postgres de la nube (features.postgres)."
  }
}

variable "auth_provider" {
  description = "Identidad (AUTH_PROVIDER): mirai (Better Auth en la API, D1) o supabase (hasta el corte B). Identity Platform queda como adaptador opcional solo en GCP (variables-gcp.tf)."
  type        = string
  default     = "mirai"
  validation {
    condition     = contains(["mirai", "supabase"], var.auth_provider)
    error_message = "auth_provider debe ser mirai o supabase."
  }
  validation {
    condition     = var.auth_provider != "supabase" || var.features.supabase
    error_message = "auth_provider = supabase necesita features.supabase = true."
  }
}

variable "db_adapter" {
  description = "Acceso a datos de la API: pg (Kysely sobre la Postgres de la nube), postgrest (puente interno, D4) o supabase."
  type        = string
  default     = "pg"
  validation {
    condition     = contains(["pg", "postgrest", "supabase"], var.db_adapter)
    error_message = "db_adapter debe ser pg, postgrest o supabase."
  }
  validation {
    condition     = var.db_adapter == "supabase" ? var.features.supabase : var.features.postgres
    error_message = "db_adapter = supabase necesita features.supabase; pg y postgrest necesitan features.postgres."
  }
  validation {
    condition     = var.db_adapter != "postgrest" || var.features.postgrest
    error_message = "db_adapter = postgrest necesita features.postgrest = true."
  }
}

variable "live_source" {
  description = "Cambios en vivo de la web: gateway (mirai-realtime, necesita features.realtime) o supabase."
  type        = string
  default     = "gateway"
  validation {
    condition     = contains(["gateway", "supabase"], var.live_source)
    error_message = "live_source debe ser gateway o supabase."
  }
  validation {
    condition     = var.live_source == "supabase" ? var.features.supabase : var.features.realtime
    error_message = "live_source = gateway necesita features.realtime; supabase necesita features.supabase."
  }
}

variable "network" {
  description = "Red del ambiente (ver capabilities/network)."
  type = object({
    cidr                = string
    zones               = optional(number, 2)
    nat_static_ip_count = optional(number, 0)
    flow_logs           = optional(bool, false)
  })
}

variable "services" {
  description = "Tamaño de los servicios de contenedores (las mismas claves en todas las nubes)."
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
    }), {})
    realtime = optional(object({
      cpu           = optional(string, "1")
      memory        = optional(string, "512Mi")
      min_instances = optional(number, 1)
      max_instances = optional(number, 5)
      concurrency   = optional(number, 250)
      cpu_always_on = optional(bool, true)
    }), {})
    worker = optional(object({
      cpu           = optional(string, "0.5")
      memory        = optional(string, "512Mi")
      min_instances = optional(number, 1)
      max_instances = optional(number, 3)
    }), {})
    postgrest = optional(object({
      cpu           = optional(string, "0.5")
      memory        = optional(string, "512Mi")
      min_instances = optional(number, 0)
      max_instances = optional(number, 3)
      concurrency   = optional(number, 80)
    }), {})
  })
  default = {}
}

variable "images" {
  description = "Imágenes iniciales (después las cambia el CI/CD). postgrest y otel_collector = imágenes oficiales con versión fija."
  type = object({
    web            = optional(string)
    api            = optional(string)
    postgrest      = optional(string, "docker.io/postgrest/postgrest:v12.2.3")
    otel_collector = optional(string, "docker.io/otel/opentelemetry-collector-contrib:0.164.0")
  })
  default = {}
}

variable "public_config" {
  description = <<-EOT
    Configuración sin secretos. Los NEXT_PUBLIC_* se incrustan en el build de la web y van al navegador:
    NEXT_PUBLIC_LEGAL_*, NEXT_PUBLIC_VAPID_PUBLIC_KEY, NEXT_PUBLIC_TURNSTILE_SITE_KEY, NEXT_PUBLIC_SENTRY_DSN,
    NEXT_PUBLIC_WOMPI_PUBLIC_KEY, NEXT_PUBLIC_ADSENSE_*, MIRAI_CSP_ENFORCE y, solo con features.supabase,
    NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY. La API recibe GOOGLE_CLIENT_ID, VAPID_* y
    WOMPI_PUBLIC_KEY. NEXT_PUBLIC_SITE_URL, NEXT_PUBLIC_API_URL, NEXT_PUBLIC_REALTIME_URL y NEXT_PUBLIC_LIVE_SOURCE
    los pone el stack.
  EOT
  type        = map(string)
  default     = {}
  validation {
    condition     = alltrue([for k in keys(var.public_config) : !can(regex("(SECRET|PASSWORD|PRIVATE|TOKEN)", k))])
    error_message = "public_config no admite secretos (SECRET, PASSWORD, PRIVATE, TOKEN): van en el almacén de secretos."
  }
  validation {
    condition     = !var.features.supabase || (contains(keys(var.public_config), "NEXT_PUBLIC_SUPABASE_URL") && contains(keys(var.public_config), "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"))
    error_message = "features.supabase necesita NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY."
  }
}

variable "api_env" {
  description = "Variables extra (sin secretos) para la API (IDEMPOTENCY_STORE, RATE_LIMIT_STORE, DOCS, OTEL_*…). Pisan las del stack."
  type        = map(string)
  default     = {}
}

variable "realtime_env" {
  description = "Variables extra (sin secretos) para el gateway (REALTIME_TOKEN_CHECK_S, REALTIME_MAX_BOOKS…). Pisan las del stack."
  type        = map(string)
  default     = {}
}

variable "worker_env" {
  description = "Variables extra (sin secretos) para MODE=worker. Pisan las del stack."
  type        = map(string)
  default     = {}
}

variable "web_env" {
  description = "Variables extra (sin secretos) para el servidor de la web (MIRAI_API_ROLLOUT…). Pisan las del stack."
  type        = map(string)
  default     = {}
}

variable "extra_web_origins" {
  description = "Orígenes extra para CORS de la API y el WebSocket (WEB_ORIGINS), p. ej. la web en Vercel durante la transición."
  type        = list(string)
  default     = []
  validation {
    condition     = alltrue([for o in var.extra_web_origins : can(regex("^https://[^/]+$", o))])
    error_message = "Cada origen va como https://dominio, sin barra final."
  }
}

variable "optional_secrets" {
  description = "Secretos opcionales que ya tienen valor cargado y se montan (catálogo: capabilities/app-config/secrets.tf)."
  type        = list(string)
  default     = []
}

variable "bucket_suffix" {
  description = "Sufijo para que los nombres de bucket sean únicos en el mundo (p. ej. engynex)."
  type        = string
  validation {
    condition     = can(regex("^[a-z0-9]{3,12}$", var.bucket_suffix))
    error_message = "3 a 12 minúsculas o números."
  }
}

variable "postgres" {
  description = "Postgres administrada (ver capabilities/postgres). tier = nombre exacto de la nube (pisa size)."
  type = object({
    engine_version    = optional(number, 17)
    size              = optional(string, "s")
    tier              = optional(string)
    high_availability = optional(bool, false)
    storage_gb        = optional(number, 20)
    backup_days       = optional(number, 14)
    pitr_days         = optional(number, 7)
    max_connections   = optional(number)
    iam_users         = optional(map(string), {})
  })
  default = {}
}

variable "redis" {
  description = "Redis administrado (con el gateway en varias instancias)."
  type = object({
    high_availability = optional(bool, false)
    memory_gb         = optional(number, 1)
    tls               = optional(bool, false)
  })
  default = {}
}

variable "waf" {
  description = "WAF y límites del borde (ver capabilities/edge)."
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
  description = "true = el cron manda {\"dry\":true}: la API calcula y registra sin enviar (comparación antes del corte)."
  type        = bool
  default     = false
}

variable "log_sample_rate" {
  description = "Fracción de peticiones del borde que quedan en los registros."
  type        = number
  default     = 1.0
  validation {
    condition     = var.log_sample_rate >= 0 && var.log_sample_rate <= 1
    error_message = "Entre 0 y 1."
  }
}

variable "alert_emails" {
  description = "Correos de alertas (clave fija → correo)."
  type        = map(string)
}

variable "budget" {
  description = "Presupuesto mensual (billing_scope null en GCP = sin presupuesto; ver capabilities/budget)."
  type = object({
    amount        = optional(number, 100)
    currency      = optional(string, "USD")
    billing_scope = optional(string)
  })
  default = {}
}

variable "dns" {
  description = "Zona DNS administrada (solo con features.dns; hoy el DNS vive en Hostinger)."
  type = object({
    zone_name   = optional(string)
    create_zone = optional(bool, true)
  })
  default = {}
  validation {
    condition     = !var.features.dns || var.dns.zone_name != null
    error_message = "features.dns necesita dns.zone_name."
  }
}

variable "migrate_job" {
  description = "Trabajo que aplica las migraciones SQL dentro de la red privada (usa la imagen de la API)."
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
