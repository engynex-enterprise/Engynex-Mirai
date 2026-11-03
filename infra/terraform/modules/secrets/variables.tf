variable "project_id" {
  description = "Proyecto donde viven los secretos del ambiente."
  type        = string
}

variable "prefix" {
  description = "Prefijo del nombre de cada secreto (mirai-<ambiente>)."
  type        = string
}

variable "labels" {
  description = "Etiquetas comunes."
  type        = map(string)
  default     = {}
}

variable "secrets" {
  description = <<-EOT
    Secretos a crear (solo el contenedor: los valores se cargan aparte con gcloud, nunca desde Terraform).
    Clave = nombre corto (p. ej. "encryption-key"). accessors = clave fija → miembro con secretAccessor.
  EOT
  type = map(object({
    description = string
    accessors   = optional(map(string), {})
    labels      = optional(map(string), {})
  }))
  validation {
    condition     = alltrue([for k in keys(var.secrets) : can(regex("^[a-z0-9][a-z0-9-]{1,60}$", k))])
    error_message = "Los nombres cortos usan minúsculas, números y guiones (máx. 61)."
  }
}

variable "generated_values" {
  description = "Valores que genera la propia infraestructura (p. ej. la clave de Redis). Clave = nombre corto existente en secrets."
  type        = map(string)
  default     = {}
  sensitive   = true
}
