variable "project_id" {
  description = "Proyecto del ambiente."
  type        = string
}

variable "region" {
  description = "Región de las colas (la de Cloud Run)."
  type        = string
}

variable "prefix" {
  description = "Prefijo de nombres (mirai-<ambiente>). Un nombre de cola borrado no se puede reutilizar en 7 días."
  type        = string
}

variable "oidc_service_account_email" {
  description = "Cuenta que firma el token OIDC de cada tarea (run.invoker sobre la API)."
  type        = string
}

variable "oidc_audience" {
  description = "Audiencia del token (URL de la API)."
  type        = string
}

variable "enqueuers" {
  description = "Quién puede crear tareas (clave fija → miembro), normalmente la cuenta de la API."
  type        = map(string)
  default     = {}
}

variable "queues" {
  description = "Colas: clave → límites de tasa y reintentos."
  type = map(object({
    max_dispatches_per_second = number
    max_concurrent_dispatches = number
    max_attempts              = optional(number, 5)
    min_backoff               = optional(string, "10s")
    max_backoff               = optional(string, "600s")
    max_retry_duration        = optional(string, "3600s")
    log_sampling_ratio        = optional(number, 1.0)
  }))
  validation {
    condition     = alltrue([for q in values(var.queues) : q.max_dispatches_per_second > 0 && q.max_dispatches_per_second <= 500])
    error_message = "max_dispatches_per_second entre 0 y 500."
  }
}
