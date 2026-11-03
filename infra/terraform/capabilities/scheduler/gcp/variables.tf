# ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────
# CONTRATO de la capacidad. Este archivo es IDÉNTICO en gcp/, aws/ y azure/ (lo revisa
# infra/terraform/scripts/contrato.py en CI). Para cambiarlo: edítalo en las tres carpetas a la vez.
# Lo propio de cada nube entra por `context.cloud` (mapa de texto) o por `cloud_options` (cada implementación
# documenta las claves que lee e ignora las demás). Los "handles" (network, platform, origin…) son opacos: su
# forma la define la implementación de cada nube y solo se pasan de una capacidad a otra de la MISMA nube.
# ─────────────────────────────────────────────────────────────────────────────────────────────────────────────────

variable "context" {
  description = <<-EOT
    Contexto común del ambiente. prefix = mirai-<ambiente>; region = región de la nube (us-east1, us-east-1, eastus2…).
    cloud = datos propios de la nube: gcp → project_id, project_number; aws → account_id; azure → resource_group_name,
    subscription_id, tenant_id.
  EOT
  type = object({
    prefix      = string
    environment = string
    region      = string
    labels      = map(string)
    cloud       = map(string)
  })
  validation {
    condition     = contains(["pruebas", "produccion"], var.context.environment) && can(regex("^mirai-[a-z0-9-]+$", var.context.prefix))
    error_message = "context.environment debe ser pruebas o produccion y context.prefix empezar por mirai-."
  }
}

variable "cloud_options" {
  description = "Ajustes propios de la nube (opcionales). Cada implementación documenta en su main.tf las claves que lee."
  type        = any
  default     = {}
}

# ── scheduler: cron que llama a la API por HTTP (/v1/jobs/*). GCP: Cloud Scheduler con OIDC; AWS: EventBridge
#    Scheduler → tarea de ECS con curl y Bearer CRON_SECRET; Azure: Container Apps Job con cron y curl.

variable "jobs" {
  description = "Trabajos: clave → { schedule (cron), path (/v1/jobs/…), description, body, deadline_s, retry_count, paused }."
  type = map(object({
    schedule    = string
    path        = string
    description = string
    body        = optional(string, "{}")
    deadline_s  = optional(number, 180)
    retry_count = optional(number, 3)
    paused      = optional(bool, false)
  }))
  validation {
    condition     = alltrue([for j in values(var.jobs) : startswith(j.path, "/")])
    error_message = "Cada path debe empezar por /."
  }
  validation {
    condition     = alltrue([for j in values(var.jobs) : j.deadline_s >= 15 && j.deadline_s <= 1800])
    error_message = "deadline_s entre 15 y 1800."
  }
}

variable "target" {
  description = "A dónde llama: base_url (URL interna de la API), audience e identity (GCP: OIDC), host_header (AWS/Azure: Host del ALB o del entorno interno)."
  type = object({
    base_url    = string
    audience    = optional(string)
    identity    = optional(string)
    host_header = optional(string)
  })
  validation {
    condition     = can(regex("^https?://", var.target.base_url))
    error_message = "target.base_url debe empezar por http:// o https://."
  }
}

variable "platform" {
  description = "Handle de la plataforma de contenedores (AWS y Azure corren el curl ahí; GCP lo ignora)."
  type        = any
  default     = null
}

variable "identity" {
  description = "Handle de la identidad con la que corre el disparador (AWS: rol de la tarea; Azure: identidad del job; GCP: la de target.identity)."
  type        = any
  default     = null
}

variable "secret_ref" {
  description = "Referencia al secreto CRON_SECRET (AWS y Azure mandan Authorization: Bearer). GCP usa OIDC y lo ignora."
  type        = string
  default     = null
}

variable "time_zone" {
  description = "Zona horaria de los horarios cron."
  type        = string
  default     = "America/Bogota"
}

variable "paused" {
  description = "Pausa todos los trabajos."
  type        = bool
  default     = false
}
