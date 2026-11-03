variable "project_id" {
  description = "Proyecto del ambiente."
  type        = string
}

variable "region" {
  description = "Región de la instancia (la misma de Cloud Run)."
  type        = string
}

variable "name" {
  description = "Nombre de la instancia (mirai-<ambiente>-pg). No se puede reutilizar hasta una semana después de borrarla."
  type        = string
}

variable "labels" {
  description = "Etiquetas de la instancia."
  type        = map(string)
  default     = {}
}

variable "database_version" {
  description = "Versión de PostgreSQL (igual o mayor que la de Supabase para que el volcado restaure sin cambios)."
  type        = string
  default     = "POSTGRES_17"
  validation {
    condition     = can(regex("^POSTGRES_(15|16|17|18)$", var.database_version))
    error_message = "Usa POSTGRES_15 a POSTGRES_18."
  }
}

variable "edition" {
  description = "ENTERPRISE (económica) o ENTERPRISE_PLUS (más rendimiento, caché de datos, 99,99 %)."
  type        = string
  default     = "ENTERPRISE"
  validation {
    condition     = contains(["ENTERPRISE", "ENTERPRISE_PLUS"], var.edition)
    error_message = "edition debe ser ENTERPRISE o ENTERPRISE_PLUS."
  }
}

variable "tier" {
  description = "Máquina: db-g1-small (núcleo compartido, solo pruebas), db-custom-<vCPU>-<MB> en ENTERPRISE o db-perf-optimized-N-<n> en ENTERPRISE_PLUS."
  type        = string
  default     = "db-custom-1-3840"
}

variable "high_availability" {
  description = "true = REGIONAL (réplica en espera en otra zona, conmutación automática; duplica el costo de cómputo y disco)."
  type        = bool
  default     = false
}

variable "disk_size_gb" {
  description = "Disco inicial en GB (crece solo)."
  type        = number
  default     = 20
  validation {
    condition     = var.disk_size_gb >= 10
    error_message = "Mínimo 10 GB."
  }
}

variable "disk_autoresize_limit_gb" {
  description = "Tope del crecimiento automático del disco (0 = sin tope)."
  type        = number
  default     = 200
}

variable "private_network" {
  description = "self_link de la VPC (IP privada por Private Services Access)."
  type        = string
}

variable "allocated_ip_range" {
  description = "Nombre del rango reservado de Private Services Access."
  type        = string
  default     = null
}

variable "backup_retention_count" {
  description = "Copias diarias que se conservan."
  type        = number
  default     = 14
  validation {
    condition     = var.backup_retention_count >= 7 && var.backup_retention_count <= 365
    error_message = "Entre 7 y 365 copias."
  }
}

variable "pitr_days" {
  description = "Días de recuperación a un punto en el tiempo (registros de transacciones)."
  type        = number
  default     = 7
  validation {
    condition     = var.pitr_days >= 1 && var.pitr_days <= 35
    error_message = "Entre 1 y 35 días (ENTERPRISE admite hasta 7)."
  }
}

variable "backup_location" {
  description = "Ubicación de las copias (multi-región \"us\" para sobrevivir a la caída de una región)."
  type        = string
  default     = "us"
}

variable "backup_start_time" {
  description = "Hora UTC de la copia diaria (08:00 UTC = 3:00 a. m. en Colombia)."
  type        = string
  default     = "08:00"
}

variable "maintenance_day" {
  description = "Día de mantenimiento (1 = lunes … 7 = domingo)."
  type        = number
  default     = 7
}

variable "maintenance_hour_utc" {
  description = "Hora UTC del mantenimiento (9 = 4:00 a. m. en Colombia)."
  type        = number
  default     = 9
}

variable "max_connections" {
  description = "Tope de conexiones (null = el de la máquina). Cuenta: instancias máximas × tamaño del pool."
  type        = number
  default     = null
}

variable "logical_decoding" {
  description = "Activa cloudsql.logical_decoding (replicación lógica hacia Supabase como plan de vuelta atrás tras el corte)."
  type        = bool
  default     = true
}

variable "managed_connection_pooling" {
  description = "Managed Connection Pooling de Cloud SQL (solo ENTERPRISE_PLUS)."
  type        = bool
  default     = false
}

variable "database_name" {
  description = "Base de datos de la aplicación."
  type        = string
  default     = "mirai"
}

variable "iam_service_accounts" {
  description = "Cuentas de servicio que entran con autenticación IAM (sin contraseña). Clave fija → correo."
  type        = map(string)
  default     = {}
}

variable "iam_users" {
  description = "Personas (correo de Google) que entran con IAM para soporte, p. ej. el dueño. Clave fija → correo."
  type        = map(string)
  default     = {}
}

variable "deletion_protection" {
  description = "Protección contra borrado (Terraform y API)."
  type        = bool
  default     = true
}
