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

# ── redis: Redis administrado (GCP: Memorystore; AWS: ElastiCache; Azure: Azure Cache for Redis). Adaptador de
#    socket.io y presencia del gateway; siempre con clave y solo por la red privada.

variable "network" {
  description = "Handle de la red (salida network de la misma nube)."
  type        = any
}

variable "name" {
  description = "Nombre de la instancia (mirai-<ambiente>-redis)."
  type        = string
}

variable "high_availability" {
  description = "Réplica con conmutación automática (GCP STANDARD_HA, AWS multi-AZ, Azure Standard)."
  type        = bool
  default     = false
}

variable "memory_gb" {
  description = "Memoria en GB (1 GB alcanza para pub/sub de socket.io y presencia con TTL)."
  type        = number
  default     = 1
  validation {
    condition     = var.memory_gb >= 1 && var.memory_gb <= 300
    error_message = "Entre 1 y 300 GB."
  }
}

variable "tls" {
  description = "TLS en tránsito. GCP: false mientras la API no acepte la CA propia de Memorystore (ver modules/redis). AWS y Azure: true recomendado (CA pública)."
  type        = bool
  default     = false
}
