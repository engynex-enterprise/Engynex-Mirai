# app-config: configuración de la aplicación SIN nube. Lo usan los tres stacks (clouds/{gcp,aws,azure}/stack) para que
# las variables de entorno, el catálogo de secretos, los orígenes y las rutas del mismo origen sean idénticos en
# cualquier nube. Cada nube solo aporta lo suyo por `cloud_env` (driver de colas, buckets, identidades…) e
# `internal_urls`. No crea recursos ni usa proveedores: se prueba con `terraform test` sin credenciales.
# Nombres de variables = los que validan apps/api/src/core/config/config.schema.ts (y los módulos de F2-E/F2-G/F2-I)
# y apps/web/.env.example; inventario en docs/infra/estrategia-gcp.md §5–§6 y docs/infra/cambiar-de-nube.md.

variable "environment" {
  description = "Ambiente: pruebas o produccion."
  type        = string
  validation {
    condition     = contains(["pruebas", "produccion"], var.environment)
    error_message = "environment debe ser pruebas o produccion."
  }
}

variable "git_branch" {
  description = "Rama que despliega el ambiente (consola › Sistema)."
  type        = string
}

variable "domains" {
  description = "Dominios del ambiente (sin https://)."
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
}

variable "same_origin" {
  description = "true = el navegador habla con la API y el gateway por el dominio de la web (/v1/*, /api/auth/*, /socket.io/*), sin CORS (D2). api. y rt. siguen existiendo para webhooks, Google y clientes externos."
  type        = bool
  default     = true
}

variable "extra_web_origins" {
  description = "Orígenes extra para WEB_ORIGINS (CORS y origen del WebSocket)."
  type        = list(string)
  default     = []
}

variable "public_config" {
  description = "Configuración pública (NEXT_PUBLIC_*, GOOGLE_CLIENT_ID, VAPID_SUBJECT…). Sin secretos."
  type        = map(string)
  default     = {}
}

variable "features" {
  description = "Piezas encendidas en el ambiente (las mismas banderas en las tres nubes)."
  type = object({
    postgres  = bool
    redis     = bool
    realtime  = bool
    postgrest = bool
    worker    = bool
    storage   = bool
    supabase  = bool # puente con Supabase (paso A): monta SUPABASE_SECRET_KEY y manda SUPABASE_URL
    vertex_ai = bool # GCP: proveedor de IA de la plataforma sin llave (D13)
    otel      = bool # OpenTelemetry: OTLP al colector sidecar de cada nube (infra/otel/collector.<nube>.yaml)
  })
}

variable "auth_provider" {
  description = "Identidad (AUTH_PROVIDER de la API): mirai (Better Auth en /api/auth/*, D1) o supabase (hasta el corte B)."
  type        = string
  default     = "mirai"
  validation {
    condition     = contains(["mirai", "supabase"], var.auth_provider)
    error_message = "auth_provider debe ser mirai o supabase (lo que acepta apps/api/src/modules/auth/auth.env.ts)."
  }
}

variable "db_adapter" {
  description = "Acceso a datos de la API: pg (Kysely sobre la Postgres de la nube), postgrest (puente interno) o supabase."
  type        = string
  default     = "pg"
  validation {
    condition     = contains(["pg", "postgrest", "supabase"], var.db_adapter)
    error_message = "db_adapter debe ser pg, postgrest o supabase."
  }
}

variable "live_source" {
  description = "Cambios en vivo de la web: gateway (mirai-realtime) o supabase (Supabase Realtime)."
  type        = string
  default     = "gateway"
  validation {
    condition     = contains(["gateway", "supabase"], var.live_source)
    error_message = "live_source debe ser gateway o supabase."
  }
}

variable "optional_secrets" {
  description = "Secretos opcionales que ya tienen valor cargado y se montan (un secreto montado sin valor impide arrancar)."
  type        = list(string)
  default     = []
}

variable "internal_urls" {
  description = "URL internas que conoce la nube: api (la usan la web para SSR, Cloud Tasks y el cron) y postgrest (solo la API)."
  type = object({
    api       = string
    postgrest = optional(string)
  })
}

variable "otel_endpoint" {
  description = "OTEL_EXPORTER_OTLP_ENDPOINT con features.otel (el colector sidecar escucha en localhost:4318)."
  type        = string
  default     = "http://localhost:4318"
}

variable "cloud_env" {
  description = "Variables que pone cada nube (drivers y nombres de sus recursos): api, realtime, worker, web y migrate."
  type = object({
    api      = optional(map(string), {})
    realtime = optional(map(string), {})
    worker   = optional(map(string), {})
    web      = optional(map(string), {})
    migrate  = optional(map(string), {})
  })
  default = {}
}

variable "api_env" {
  description = "Variables extra (sin secretos) para la API. Pisan las calculadas."
  type        = map(string)
  default     = {}
}

variable "realtime_env" {
  description = "Variables extra (sin secretos) para el gateway (MODE=realtime). Pisan las calculadas."
  type        = map(string)
  default     = {}
}

variable "worker_env" {
  description = "Variables extra (sin secretos) para MODE=worker. Pisan las calculadas."
  type        = map(string)
  default     = {}
}

variable "web_env" {
  description = "Variables extra (sin secretos) para el servidor de la web. Pisan las calculadas."
  type        = map(string)
  default     = {}
}
