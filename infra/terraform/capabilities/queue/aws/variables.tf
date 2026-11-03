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

# ── queue: colas de trabajo de la API (notify, automations, slow). GCP: Cloud Tasks (empuje HTTP con OIDC);
#    AWS: SQS + DLQ y Azure: Service Bus (las consume MODE=worker y despacha por POST a la API). enabled = false →
#    QUEUE_DRIVER=http: la API se llama a sí misma por HTTP con CRON_SECRET, sin cola ni servicios extra.

variable "enabled" {
  description = "false = no se crea nada y la API despacha directo por HTTP (QUEUE_DRIVER=http, sin worker)."
  type        = bool
  default     = true
}

variable "queues" {
  description = "Colas: id literal (el de QueueName en apps/api/src/core/queue/queue.port.ts) → límites y reintentos (segundos)."
  type = map(object({
    max_per_second = number
    max_concurrent = number
    max_attempts   = optional(number, 5)
    min_backoff_s  = optional(number, 10)
    max_backoff_s  = optional(number, 600)
    max_retry_s    = optional(number, 3600)
    log_sampling   = optional(number, 1.0)
  }))
  validation {
    condition     = alltrue([for k in keys(var.queues) : can(regex("^[a-z][a-z0-9-]{0,40}$", k))])
    error_message = "Id de cola: minúsculas, números y guiones."
  }
  validation {
    condition     = alltrue([for q in values(var.queues) : q.max_per_second > 0 && q.max_per_second <= 500])
    error_message = "max_per_second entre 0 y 500."
  }
}

variable "target" {
  description = "Destino de las tareas donde la cola empuja por HTTP (GCP): URL base de la API, audiencia OIDC y correo de la identidad que firma. Las colas de extracción (AWS, Azure) lo ignoran."
  type = object({
    url      = string
    audience = optional(string)
    identity = optional(string)
  })
}

variable "enqueuers" {
  description = "Quién puede encolar (principals de identity), normalmente la API."
  type        = map(string)
  default     = {}
}

variable "consumers" {
  description = "Quién consume y borra mensajes (principals), normalmente MODE=worker. GCP lo ignora (Cloud Tasks empuja)."
  type        = map(string)
  default     = {}
}
