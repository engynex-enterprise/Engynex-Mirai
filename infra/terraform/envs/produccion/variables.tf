variable "project_id" {
  description = "Proyecto de GCP de producción."
  type        = string
}

variable "cicd_project_id" {
  description = "Proyecto compartido de CI/CD (salida projects.cicd del bootstrap)."
  type        = string
}

variable "region" {
  description = "Región del ambiente (us-west1 mientras la base siga en Supabase us-west-2)."
  type        = string
  default     = "us-west1"
}

variable "bucket_suffix" {
  description = "Sufijo único para los nombres de bucket."
  type        = string
  default     = "engynex"
}

variable "domains" {
  description = "Dominios de producción (sin https://)."
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
  default = {
    web                       = "mirai.engynex.com"
    api                       = "api.mirai.engynex.com"
    realtime                  = "rt.mirai.engynex.com"
    files                     = "files.mirai.engynex.com"
    canary_web                = "canary.mirai.engynex.com"
    canary_api                = "canary-api.mirai.engynex.com"
    certificate               = ["mirai.engynex.com", "*.mirai.engynex.com"]
    dns_authorization_domains = ["mirai.engynex.com"]
  }
}

variable "stages" {
  description = "Etapa de la migración (docs/infra/estrategia-gcp.md §7). Ver stack/variables.tf."
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
}

variable "public_config" {
  description = "Configuración pública (NEXT_PUBLIC_*, GOOGLE_CLIENT_ID, VAPID_SUBJECT…). Sin secretos."
  type        = map(string)
}

variable "api_env" {
  description = "Variables extra (sin secretos) para la API."
  type        = map(string)
  default     = {}
}

variable "realtime_env" {
  description = "Variables extra (sin secretos) para el gateway realtime (REALTIME_*)."
  type        = map(string)
  default     = {}
}

variable "extra_web_origins" {
  description = "Orígenes extra para WEB_ORIGINS (CORS de la API y origen del WebSocket), p. ej. la web en Vercel durante la transición."
  type        = list(string)
  default     = []
}

variable "live_source" {
  description = "Fuente de los cambios en vivo de la web: supabase (hoy) o gateway (fase 4, con stages.realtime)."
  type        = string
  default     = "supabase"
}

variable "optional_secrets" {
  description = "Secretos opcionales que ya tienen valor en Secret Manager y se montan en los servicios."
  type        = list(string)
  default     = []
}

variable "scheduler_dry_run" {
  description = "Modo simulación del cron (etapa 2)."
  type        = bool
  default     = false
}

variable "db_adapter" {
  description = "supabase (hasta el corte) o pg (Cloud SQL)."
  type        = string
  default     = "supabase"
}

variable "alert_emails" {
  description = "Correos de alertas (clave → correo)."
  type        = map(string)
}

variable "billing_account" {
  description = "Cuenta de facturación para el presupuesto (null = sin presupuesto)."
  type        = string
  default     = null
}

variable "budget_amount" {
  description = "Presupuesto mensual de producción."
  type        = number
}

variable "budget_currency" {
  description = "Moneda de la cuenta de facturación."
  type        = string
  default     = "USD"
}

variable "artifact_registry_path" {
  description = "Salida artifact_registry_path del bootstrap."
  type        = string
  validation {
    condition     = can(regex("^[a-z0-9-]+-docker\\.pkg\\.dev/[a-z0-9-]+/[a-z0-9-]+$", var.artifact_registry_path))
    error_message = "Formato <región>-docker.pkg.dev/<proyecto>/<repo>."
  }
}

variable "artifact_registry_repo" {
  description = "Salida artifact_registry_repo del bootstrap."
  type        = string
  default     = "mirai"
}

variable "cloudbuild_repository_id" {
  description = "Salida cloudbuild_repository_id del bootstrap (null = sin disparadores todavía)."
  type        = string
  default     = null
}

variable "smoke_tests" {
  description = "Prueba de humo por canary-* antes de mover tráfico. false solo para el primer despliegue (certificado aún no activo)."
  type        = bool
  default     = true
}

variable "google_client_id" {
  description = "Client ID de OAuth de Google (para Identity Platform en la etapa 4)."
  type        = string
  default     = null
}

variable "nat_static_ip_count" {
  description = "IP fijas de salida (0 = automáticas)."
  type        = number
  default     = 0
}

variable "cloud_sql_iam_users" {
  description = "Personas con acceso IAM a Cloud SQL para soporte (clave → correo)."
  type        = map(string)
  default     = {}
}
