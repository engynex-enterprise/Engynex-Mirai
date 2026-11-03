variable "project_id" {
  description = "Proyecto del ambiente."
  type        = string
}

variable "prefix" {
  description = "Prefijo de nombres (mirai-<ambiente>)."
  type        = string
}

variable "notification_emails" {
  description = "Correos que reciben las alertas (clave fija → correo)."
  type        = map(string)
  validation {
    condition     = alltrue([for e in values(var.notification_emails) : can(regex("^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$", e))])
    error_message = "Correo no válido en notification_emails."
  }
}

variable "runbook_url" {
  description = "Enlace al runbook que aparece en cada alerta."
  type        = string
  default     = "https://github.com/engynex/mirai/blob/main/docs/infra/runbook.md"
}

variable "cloud_run_services" {
  description = "Servicios a vigilar: nombre → umbrales. latency_p95_ms = null desactiva la alerta de latencia (p. ej. realtime con WebSocket)."
  type = map(object({
    error_ratio    = optional(number, 0.02)
    latency_p95_ms = optional(number)
  }))
  default = {}
}

variable "uptime_checks" {
  description = "Chequeos de disponibilidad desde varias regiones: clave → { host, path }. Solo por el balanceador (el ingress interno bloquea *.run.app)."
  type = map(object({
    host = string
    path = string
  }))
  default = {}
}

variable "cloud_sql_instance" {
  description = "Nombre de la instancia de Cloud SQL a vigilar (null si aún no existe)."
  type        = string
  default     = null
}

variable "redis_instance_id" {
  description = "ID de Memorystore (projects/<p>/locations/<r>/instances/<n>) o null."
  type        = string
  default     = null
}

variable "task_queues" {
  description = "Nombres cortos de colas de Cloud Tasks a vigilar (profundidad)."
  type        = list(string)
  default     = []
}

variable "queue_depth_threshold" {
  description = "Tareas pendientes que disparan la alerta (sostenido 15 min)."
  type        = number
  default     = 500
}

variable "app_error_threshold" {
  description = "Registros con severidad ERROR o más en 5 min (todos los servicios) que disparan la alerta."
  type        = number
  default     = 25
}
