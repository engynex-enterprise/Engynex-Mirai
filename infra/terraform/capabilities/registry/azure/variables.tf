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

# ── registry: registro de imágenes (GCP: Artifact Registry; AWS: ECR, un repositorio por imagen; Azure: ACR) con
#    limpieza automática. Vive en la cuenta/proyecto de CI/CD (bootstrap) y lo comparten los ambientes.

variable "name" {
  description = "Nombre del repositorio (GCP/Azure) o prefijo de los repositorios (AWS: <name>/<imagen>)."
  type        = string
  default     = "mirai"
  validation {
    condition     = can(regex("^[a-z]([a-z0-9-]*[a-z0-9])?$", var.name))
    error_message = "Solo minúsculas, números y guiones; empieza por letra."
  }
}

variable "images" {
  description = "Imágenes que se publican (AWS crea un repositorio por cada una; GCP y Azure las guardan en el mismo)."
  type        = list(string)
  default     = ["web", "api"]
}

variable "keep_recent" {
  description = "Versiones recientes de cada imagen que se conservan siempre (para poder revertir)."
  type        = number
  default     = 30
  validation {
    condition     = var.keep_recent >= 5
    error_message = "Conserva al menos 5 versiones."
  }
}

variable "untagged_ttl_days" {
  description = "Días antes de borrar imágenes sin etiqueta."
  type        = number
  default     = 7
}

variable "tagged_ttl_days" {
  description = "Días antes de borrar imágenes etiquetadas que ya no están entre las recientes."
  type        = number
  default     = 120
}

variable "cleanup_dry_run" {
  description = "true = la limpieza solo informa (donde la nube lo permite)."
  type        = bool
  default     = false
}

variable "readers" {
  description = "Principals con lectura (agentes que descargan imágenes)."
  type        = map(string)
  default     = {}
}

variable "writers" {
  description = "Principals con escritura (identidades de CI/CD)."
  type        = map(string)
  default     = {}
}
