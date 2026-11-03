variable "project_id" {
  description = "Proyecto donde vive el repositorio (el de CI/CD, compartido por los ambientes)."
  type        = string
}

variable "location" {
  description = "Región del repositorio (la misma de Cloud Run para no pagar salida entre regiones)."
  type        = string
}

variable "repository_id" {
  description = "Nombre del repositorio de imágenes Docker."
  type        = string
  default     = "mirai"
  validation {
    condition     = can(regex("^[a-z]([a-z0-9-]*[a-z0-9])?$", var.repository_id))
    error_message = "Solo minúsculas, números y guiones; empieza por letra."
  }
}

variable "labels" {
  description = "Etiquetas comunes."
  type        = map(string)
  default     = {}
}

variable "keep_recent" {
  description = "Cuántas versiones recientes de cada imagen se conservan siempre (para poder revertir)."
  type        = number
  default     = 30
  validation {
    condition     = var.keep_recent >= 5
    error_message = "Conserva al menos 5 versiones para poder revertir."
  }
}

variable "untagged_ttl_days" {
  description = "Días antes de borrar capas o imágenes sin etiqueta."
  type        = number
  default     = 7
}

variable "tagged_ttl_days" {
  description = "Días antes de borrar imágenes etiquetadas que ya no están entre las recientes."
  type        = number
  default     = 120
}

variable "cleanup_dry_run" {
  description = "true = las políticas de limpieza solo informan (útil las primeras semanas)."
  type        = bool
  default     = false
}

variable "readers" {
  description = "Miembros con lectura (clave fija → miembro), p. ej. el agente de Cloud Run de cada ambiente."
  type        = map(string)
  default     = {}
}

variable "writers" {
  description = "Miembros con escritura (clave fija → miembro), p. ej. las cuentas de despliegue."
  type        = map(string)
  default     = {}
}
