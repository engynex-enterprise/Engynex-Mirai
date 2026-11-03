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

# ── postgres: PostgreSQL administrado (GCP: Cloud SQL; AWS: RDS; Azure: Database for PostgreSQL Flexible Server).
#    Solo IP privada, TLS obligatorio, copias diarias y PITR. Los usuarios con contraseña los genera Terraform y sus
#    URL salen como valores sensibles para guardarlas en el almacén de secretos (capacidad secrets, generated_values).

variable "network" {
  description = "Handle de la red (salida network de la misma nube). La base solo tiene IP privada."
  type        = any
}

variable "name" {
  description = "Nombre de la instancia (mirai-<ambiente>-pg)."
  type        = string
}

variable "engine_version" {
  description = "Versión mayor de PostgreSQL (igual o mayor que la de Supabase para que el volcado restaure sin cambios)."
  type        = number
  default     = 17
  validation {
    condition     = contains([15, 16, 17, 18], var.engine_version)
    error_message = "engine_version entre 15 y 18."
  }
}

variable "size" {
  description = "Tamaño abstracto: xs (núcleo compartido, solo pruebas), s (1 vCPU ~4 GB), m (2 vCPU ~8 GB), l (4 vCPU ~16 GB). cloud_options.tier lo pisa con el nombre exacto de la nube."
  type        = string
  default     = "s"
  validation {
    condition     = contains(["xs", "s", "m", "l"], var.size)
    error_message = "size debe ser xs, s, m o l."
  }
}

variable "high_availability" {
  description = "Réplica en espera en otra zona con conmutación automática (duplica cómputo y disco)."
  type        = bool
  default     = false
}

variable "storage_gb" {
  description = "Disco inicial en GB (crece solo hasta storage_max_gb)."
  type        = number
  default     = 20
  validation {
    condition     = var.storage_gb >= 10
    error_message = "Mínimo 10 GB."
  }
}

variable "storage_max_gb" {
  description = "Tope del crecimiento automático del disco."
  type        = number
  default     = 200
}

variable "backup_days" {
  description = "Copias diarias que se conservan."
  type        = number
  default     = 14
  validation {
    condition     = var.backup_days >= 7 && var.backup_days <= 35
    error_message = "Entre 7 y 35 días (el máximo común de las tres nubes)."
  }
}

variable "pitr_days" {
  description = "Días de recuperación a un punto en el tiempo."
  type        = number
  default     = 7
  validation {
    condition     = var.pitr_days >= 1 && var.pitr_days <= 35
    error_message = "Entre 1 y 35 días."
  }
}

variable "max_connections" {
  description = "Tope de conexiones (null = el de la máquina). Cuenta: instancias máximas × tamaño del pool de cada servicio."
  type        = number
  default     = null
}

variable "database_name" {
  description = "Base de datos de la aplicación."
  type        = string
  default     = "mirai"
}

variable "app_users" {
  description = "Usuarios con contraseña generada: clave → nombre del rol en Postgres (p. ej. app = mirai_app, postgrest = authenticator, migrator = mirai_migrator). Los permisos (grant, membresía de authenticated/service_role) los da la línea base SQL, no Terraform."
  type        = map(string)
  default     = {}
}

variable "iam_identities" {
  description = "Identidades que entran con IAM, sin contraseña (GCP: correos de cuentas de servicio; AWS y Azure: se ignora, usan app_users)."
  type        = map(string)
  default     = {}
}

variable "iam_users" {
  description = "Personas con acceso de soporte por IAM (clave → correo). Solo GCP; en AWS/Azure se usa el administrador."
  type        = map(string)
  default     = {}
}

variable "deletion_protection" {
  description = "Protección contra borrado."
  type        = bool
  default     = true
}
