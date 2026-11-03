variable "project_id" {
  description = "Proyecto de GCP de producción."
  type        = string
}

variable "cicd_project_id" {
  description = "Proyecto compartido de CI/CD (salida projects.cicd del bootstrap)."
  type        = string
}

variable "region" {
  description = "Región del ambiente (D12: us-east1; us-west1 si se queda junto a Supabase durante el paso A)."
  type        = string
  default     = "us-east1"
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

variable "same_origin" {
  description = "Mismo origen (D2): /v1, /api/auth y /socket.io por el dominio de la web."
  type        = bool
  default     = true
}

variable "features" {
  description = "Piezas encendidas (ver clouds/gcp/stack/variables-comunes.tf)."
  type        = any
  default     = {}
}

variable "auth_provider" {
  description = "mirai (Better Auth) o supabase (paso A)."
  type        = string
  default     = "mirai"
}

variable "db_adapter" {
  description = "pg, postgrest o supabase."
  type        = string
  default     = "pg"
}

variable "live_source" {
  description = "gateway o supabase."
  type        = string
  default     = "gateway"
}

variable "images" {
  description = "Imágenes iniciales (web, api, postgrest)."
  type        = any
  default     = {}
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
  description = "Variables extra (sin secretos) para el gateway."
  type        = map(string)
  default     = {}
}

variable "worker_env" {
  description = "Variables extra (sin secretos) para el worker."
  type        = map(string)
  default     = {}
}

variable "web_env" {
  description = "Variables extra (sin secretos) para el servidor de la web."
  type        = map(string)
  default     = {}
}

variable "extra_web_origins" {
  description = "Orígenes extra para WEB_ORIGINS, p. ej. la web en Vercel durante la transición."
  type        = list(string)
  default     = []
}

variable "optional_secrets" {
  description = "Secretos opcionales que ya tienen valor en Secret Manager y se montan."
  type        = list(string)
  default     = []
}

variable "scheduler_dry_run" {
  description = "Modo simulación del cron."
  type        = bool
  default     = false
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
  description = "Presupuesto mensual."
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
  description = "Salida cloudbuild_repository_id del bootstrap (null = sin disparadores de Cloud Build; CI/CD principal = GitHub Actions)."
  type        = string
  default     = null
}

variable "workload_identity_pool" {
  description = "Salida workload_identity_pool del bootstrap (GitHub Actions despliega con la cuenta del ambiente). null = sin GitHub Actions."
  type        = string
  default     = null
}

variable "smoke_tests" {
  description = "Prueba de humo por canary-* antes de mover tráfico. false solo para el primer despliegue (certificado aún no activo)."
  type        = bool
  default     = true
}

variable "vertex_ai" {
  description = "Vertex AI como proveedor de IA de la plataforma (D13)."
  type        = bool
  default     = true
}

variable "google_client_id" {
  description = "Client ID de OAuth de Google (solo para Identity Platform, adaptador opcional)."
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
