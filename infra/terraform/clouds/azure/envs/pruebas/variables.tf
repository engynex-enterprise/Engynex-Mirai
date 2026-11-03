variable "subscription_id" {
  description = "Suscripción de Azure del ambiente."
  type        = string
}

variable "tenant_id" {
  description = "Tenant de Entra ID."
  type        = string
}

variable "region" {
  description = "Región (eastus2: Virginia, ~55–70 ms desde Bogotá, con zonas de disponibilidad)."
  type        = string
  default     = "eastus2"
}

variable "resource_group_name" {
  description = "Grupo de recursos del ambiente (salida environment_resource_groups del bootstrap)."
  type        = string
  default     = null
}

variable "create_resource_group" {
  description = "false si el grupo ya lo creó el bootstrap (lo normal)."
  type        = bool
  default     = false
}

variable "registry_server" {
  description = "Login server del ACR (salida registry_server del bootstrap)."
  type        = string
  default     = null
}

variable "registry_id" {
  description = "ID del ACR (salida registry_id del bootstrap): da AcrPull a las identidades de los servicios."
  type        = string
  default     = null
}

variable "queue_driver" {
  description = "servicebus (Service Bus + worker) o http (sin cola ni worker)."
  type        = string
  default     = "servicebus"
}

variable "key_vault_name" {
  description = "Nombre del Key Vault si el de por defecto ya existe en Azure (≤ 24)."
  type        = string
  default     = null
}

variable "servicebus_namespace" {
  description = "Nombre del espacio de Service Bus si el de por defecto choca."
  type        = string
  default     = null
}

variable "storage_account_names" {
  description = "Nombres de las cuentas de almacenamiento (private, backups, public) si los de por defecto chocan."
  type        = map(string)
  default     = {}
}

variable "bucket_suffix" {
  description = "Sufijo de los nombres de bucket."
  type        = string
  default     = "engynex"
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
    web                       = "pruebas.mirai.engynex.com"
    api                       = "api.pruebas.mirai.engynex.com"
    realtime                  = "rt.pruebas.mirai.engynex.com"
    files                     = "files.pruebas.mirai.engynex.com"
    canary_web                = "canary.pruebas.mirai.engynex.com"
    canary_api                = "canary-api.pruebas.mirai.engynex.com"
    certificate               = ["pruebas.mirai.engynex.com", "*.pruebas.mirai.engynex.com"]
    dns_authorization_domains = ["pruebas.mirai.engynex.com"]
  }
}

variable "features" {
  description = "Piezas encendidas (ver clouds/azure/stack/variables-comunes.tf)."
  type        = any
  default     = {}
}

variable "same_origin" {
  description = "Mismo origen para la API y el gateway."
  type        = bool
  default     = true
}

variable "auth_provider" {
  description = "mirai | supabase."
  type        = string
  default     = "mirai"
}

variable "db_adapter" {
  description = "pg | postgrest | supabase."
  type        = string
  default     = "pg"
}

variable "live_source" {
  description = "gateway | supabase."
  type        = string
  default     = "gateway"
}

variable "public_config" {
  description = "Configuración pública (NEXT_PUBLIC_*, GOOGLE_CLIENT_ID, VAPID_SUBJECT…). Sin secretos."
  type        = map(string)
  default     = {}
}

variable "api_env" {
  description = "Variables extra de la API."
  type        = map(string)
  default     = {}
}

variable "realtime_env" {
  description = "Variables extra del gateway."
  type        = map(string)
  default     = {}
}

variable "worker_env" {
  description = "Variables extra del worker."
  type        = map(string)
  default     = {}
}

variable "web_env" {
  description = "Variables extra de la web."
  type        = map(string)
  default     = {}
}

variable "extra_web_origins" {
  description = "Orígenes extra para WEB_ORIGINS."
  type        = list(string)
  default     = []
}

variable "optional_secrets" {
  description = "Secretos opcionales que ya tienen valor en Key Vault."
  type        = list(string)
  default     = []
}

variable "images" {
  description = "Imágenes iniciales (digest del ACR); después las cambia el CI/CD."
  type = object({
    web       = optional(string)
    api       = optional(string)
    postgrest = optional(string, "docker.io/postgrest/postgrest:v12.2.3")
  })
  default = {}
}

variable "scheduler_dry_run" {
  description = "Cron en simulación."
  type        = bool
  default     = false
}

variable "nat_static_ip_count" {
  description = "IP fijas de salida (mínimo 1 con NAT Gateway)."
  type        = number
  default     = 1
}

variable "alert_emails" {
  description = "Correos de alertas (clave → correo)."
  type        = map(string)
}

variable "budget_amount" {
  description = "Presupuesto mensual (USD)."
  type        = number
}

variable "billing_scope" {
  description = "null = el grupo del ambiente; /subscriptions/<id> = toda la suscripción."
  type        = string
  default     = null
}
