variable "project_id" {
  description = "Proyecto del ambiente."
  type        = string
}

variable "region" {
  description = "Región de Cloud Scheduler."
  type        = string
}

variable "prefix" {
  description = "Prefijo de nombres (mirai-<ambiente>)."
  type        = string
}

variable "target_base_url" {
  description = "URL base de la API (https://<servicio>-<número>.<región>.run.app). Scheduler cuenta como tráfico interno."
  type        = string
  validation {
    condition     = startswith(var.target_base_url, "https://")
    error_message = "target_base_url debe empezar por https://."
  }
}

variable "audience" {
  description = "Audiencia del token OIDC (la URL del servicio). La API la valida en SchedulerGuard."
  type        = string
}

variable "service_account_email" {
  description = "Cuenta de servicio que firma el token OIDC (con run.invoker sobre la API)."
  type        = string
}

variable "time_zone" {
  description = "Zona horaria de los horarios cron."
  type        = string
  default     = "America/Bogota"
}

variable "paused" {
  description = "Pausa todos los trabajos (p. ej. en pruebas mientras la base sea compartida con producción)."
  type        = bool
  default     = false
}

variable "jobs" {
  description = "Trabajos: clave → { schedule (cron), path (/v1/jobs/…), description, deadline_seconds, retry_count, paused }."
  type = map(object({
    schedule         = string
    path             = string
    description      = string
    deadline_seconds = optional(number, 180)
    retry_count      = optional(number, 3)
    paused           = optional(bool, false)
    body             = optional(string, "{}")
  }))
  validation {
    condition     = alltrue([for j in values(var.jobs) : startswith(j.path, "/")])
    error_message = "Cada path debe empezar por /."
  }
  validation {
    condition     = alltrue([for j in values(var.jobs) : j.deadline_seconds >= 15 && j.deadline_seconds <= 1800])
    error_message = "deadline_seconds entre 15 y 1800 (límite de Scheduler para HTTP)."
  }
}
