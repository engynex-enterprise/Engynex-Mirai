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

# ── object-storage: buckets de archivos (GCP: Cloud Storage; AWS: S3; Azure: Blob Storage). Los nombres lógicos de
#    Supabase (attachments/, logos/, feedback/, avatars/…) quedan como prefijos dentro de cada bucket.

variable "buckets" {
  description = <<-EOT
    Buckets: clave = propósito (private, backups, public). name = nombre global único (Azure lo convierte en nombre de
    cuenta de almacenamiento). public_read = lectura anónima (detrás del CDN del borde). writers/readers = principals.
    lifecycle = borrar objetos por prefijo después de age_days.
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
    writers             = optional(map(string), {})
    readers             = optional(map(string), {})
    lifecycle = optional(list(object({
      prefix   = string
      age_days = number
    })), [])
  }))
  validation {
    condition     = alltrue([for b in values(var.buckets) : can(regex("^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$", b.name))])
    error_message = "Nombre de bucket no válido (3-63 caracteres: minúsculas, números, guiones y puntos)."
  }
  validation {
    condition     = alltrue([for b in values(var.buckets) : b.soft_delete_days == 0 || (b.soft_delete_days >= 7 && b.soft_delete_days <= 90)])
    error_message = "soft_delete_days debe ser 0 o estar entre 7 y 90."
  }
}
