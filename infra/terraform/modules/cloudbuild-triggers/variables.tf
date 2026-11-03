variable "project_id" {
  description = "Proyecto de CI/CD donde corren los builds (el mismo de la conexión con GitHub)."
  type        = string
}

variable "location" {
  description = "Región de la conexión de Cloud Build con GitHub (2.ª generación)."
  type        = string
}

variable "repository_id" {
  description = "ID del repositorio vinculado (google_cloudbuildv2_repository, salida del bootstrap)."
  type        = string
}

variable "prefix" {
  description = "Prefijo de los disparadores (mirai-<ambiente>)."
  type        = string
}

variable "branch_regex" {
  description = "Rama que dispara el despliegue (^pruebas$ o ^main$)."
  type        = string
  validation {
    condition     = startswith(var.branch_regex, "^") && endswith(var.branch_regex, "$")
    error_message = "Usa una expresión anclada, p. ej. ^main$."
  }
}

variable "service_account_id" {
  description = "Cuenta de despliegue del ambiente (projects/<p>/serviceAccounts/<correo>)."
  type        = string
}

variable "approval_required" {
  description = "true = cada build espera aprobación manual en la consola (producción)."
  type        = bool
  default     = false
}

variable "triggers" {
  description = "Disparadores: clave → { filename, included_files, ignored_files, substitutions, description, disabled }."
  type = map(object({
    filename       = string
    description    = string
    included_files = optional(list(string), [])
    ignored_files  = optional(list(string), [])
    substitutions  = optional(map(string), {})
    disabled       = optional(bool, false)
  }))
  validation {
    condition = alltrue(flatten([
      for t in values(var.triggers) : [for k in keys(t.substitutions) : can(regex("^_[A-Z0-9_]+$", k))]
    ]))
    error_message = "Las sustituciones propias deben empezar por _ y usar MAYÚSCULAS, números y _."
  }
}
