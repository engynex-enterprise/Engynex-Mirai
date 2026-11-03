variable "project_id" {
  description = "Proyecto del ambiente."
  type        = string
}

variable "location" {
  description = "Ubicación de los buckets (la región de Cloud Run: menor latencia y sin salida entre regiones)."
  type        = string
}

variable "labels" {
  description = "Etiquetas comunes."
  type        = map(string)
  default     = {}
}

variable "buckets" {
  description = <<-EOT
    Buckets del ambiente. Clave = propósito corto (private, public, backups).
    name: nombre global único. public_read: lectura anónima (requiere excepción de la política de organización).
    lifecycle: reglas { prefix, age_days, action = Delete|SetStorageClass, storage_class }.
    object_admins / object_viewers: clave fija → miembro.
  EOT
  type = map(object({
    name                = string
    public_read         = optional(bool, false)
    versioning          = optional(bool, false)
    soft_delete_days    = optional(number, 7)
    noncurrent_ttl_days = optional(number, 30)
    cors_origins        = optional(list(string), [])
    cors_methods        = optional(list(string), ["GET", "HEAD", "PUT", "POST"])
    force_destroy       = optional(bool, false)
    object_admins       = optional(map(string), {})
    object_viewers      = optional(map(string), {})
    lifecycle = optional(list(object({
      prefix        = string
      age_days      = number
      action        = optional(string, "Delete")
      storage_class = optional(string)
    })), [])
  }))
  validation {
    condition     = alltrue([for b in values(var.buckets) : can(regex("^[a-z0-9][a-z0-9._-]{1,61}[a-z0-9]$", b.name))])
    error_message = "Nombre de bucket no válido (3-63 caracteres, minúsculas, números, guiones, puntos)."
  }
  validation {
    condition     = alltrue([for b in values(var.buckets) : b.soft_delete_days == 0 || (b.soft_delete_days >= 7 && b.soft_delete_days <= 90)])
    error_message = "soft_delete_days debe ser 0 o estar entre 7 y 90."
  }
}
