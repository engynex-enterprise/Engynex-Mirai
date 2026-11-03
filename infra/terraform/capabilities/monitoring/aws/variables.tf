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

# ── monitoring: alertas y canales (GCP: Cloud Monitoring; AWS: CloudWatch + SNS; Azure: Azure Monitor + Action Group).

variable "notification_emails" {
  description = "Correos que reciben las alertas (clave fija → correo)."
  type        = map(string)
  validation {
    condition     = alltrue([for e in values(var.notification_emails) : can(regex("^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$", e))])
    error_message = "Correo no válido en notification_emails."
  }
}

variable "services" {
  description = "Servicios a vigilar: nombre del servicio → proporción de 5xx y latencia p95 (null = sin alerta de latencia, p. ej. WebSocket)."
  type = map(object({
    error_ratio    = optional(number, 0.02)
    latency_p95_ms = optional(number)
  }))
  default = {}
}

variable "uptime_checks" {
  description = "Chequeos de disponibilidad desde internet: clave → { host, path }."
  type = map(object({
    host = string
    path = string
  }))
  default = {}
}

variable "postgres_id" {
  description = "Instancia de Postgres a vigilar (CPU, memoria, disco). null = no hay."
  type        = string
  default     = null
}

variable "redis_id" {
  description = "Instancia de Redis a vigilar (memoria). null = no hay."
  type        = string
  default     = null
}

variable "queues" {
  description = "Colas a vigilar (profundidad sostenida)."
  type        = list(string)
  default     = []
}

variable "queue_depth_threshold" {
  description = "Tareas pendientes que disparan la alerta (sostenido 15 min)."
  type        = number
  default     = 500
}

variable "app_error_threshold" {
  description = "Registros con severidad ERROR en 5 min que disparan la alerta."
  type        = number
  default     = 25
}

variable "runbook_url" {
  description = "Enlace al runbook que aparece en cada alerta."
  type        = string
  default     = "https://github.com/engynex/mirai/blob/main/docs/infra/runbook.md"
}
