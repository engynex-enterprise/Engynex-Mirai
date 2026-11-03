variable "region" {
  description = "Región de AWS (us-east-1 = Virginia, el equivalente de us-east1 de GCP: ~60–70 ms desde Bogotá)."
  type        = string
  default     = "us-east-1"
}

variable "bucket_suffix" {
  description = "Sufijo único para los nombres de bucket."
  type        = string
  default     = "engynex"
}

variable "registry_url" {
  description = "Salida registry_url del bootstrap (<cuenta>.dkr.ecr.<región>.amazonaws.com/mirai)."
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

variable "features" {
  description = "Piezas encendidas (ver clouds/aws/stack/variables-comunes.tf)."
  type        = any
  default     = {}
}

variable "auth_provider" {
  description = "mirai (Better Auth) o supabase (solo con features.supabase)."
  type        = string
  default     = "mirai"
}

variable "db_adapter" {
  description = "pg, postgrest o supabase."
  type        = string
  default     = "pg"
}

variable "live_source" {
  description = "gateway (necesita features.realtime) o supabase."
  type        = string
  default     = "gateway"
}

variable "public_config" {
  description = "Configuración pública (NEXT_PUBLIC_*, GOOGLE_CLIENT_ID, VAPID_SUBJECT…). Sin secretos."
  type        = map(string)
  default     = {}
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
  description = "Orígenes extra para WEB_ORIGINS."
  type        = list(string)
  default     = []
}

variable "optional_secrets" {
  description = "Secretos opcionales que ya tienen valor y se montan."
  type        = list(string)
  default     = []
}

variable "images" {
  description = "Imágenes iniciales (después las cambia el CI/CD)."
  type        = any
  default     = {}
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

variable "budget_amount" {
  description = "Presupuesto mensual del ambiente (USD)."
  type        = number
}

variable "dns" {
  description = "Zona de Route 53 (solo con features.dns)."
  type        = any
  default     = {}
}

variable "queue_enabled" {
  description = "true = SQS + worker; false = QUEUE_DRIVER=http (sin cola ni worker)."
  type        = bool
  default     = true
}
