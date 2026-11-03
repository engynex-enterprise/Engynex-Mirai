variable "project_id" {
  description = "Proyecto de GCP donde vive la red."
  type        = string
}

variable "name" {
  description = "Prefijo de nombres (mirai-<ambiente>)."
  type        = string
  validation {
    condition     = can(regex("^mirai-[a-z0-9-]+$", var.name))
    error_message = "El prefijo debe empezar por \"mirai-\" y usar solo minúsculas, números y guiones."
  }
}

variable "region" {
  description = "Región de la subred y del NAT (la misma de Cloud Run)."
  type        = string
}

variable "subnet_cidr" {
  description = "Rango de la subred de Cloud Run (Direct VPC egress). Mínimo /26; se recomienda /24 para crecer."
  type        = string
  default     = "10.10.0.0/24"
  validation {
    condition     = can(cidrhost(var.subnet_cidr, 0)) && tonumber(split("/", var.subnet_cidr)[1]) <= 26
    error_message = "subnet_cidr debe ser un CIDR válido de tamaño /26 o mayor (p. ej. /24)."
  }
}

variable "enable_private_services" {
  description = "Reserva un rango y crea la conexión de Private Services Access (Cloud SQL con IP privada y Memorystore)."
  type        = bool
  default     = true
}

variable "private_services_prefix_length" {
  description = "Tamaño del rango reservado para servicios administrados (Cloud SQL, Memorystore)."
  type        = number
  default     = 20
  validation {
    condition     = var.private_services_prefix_length >= 16 && var.private_services_prefix_length <= 24
    error_message = "El prefijo debe estar entre /16 y /24."
  }
}

variable "enable_nat" {
  description = "Crea Cloud Router + Cloud NAT para la salida a internet del tráfico que pasa por la VPC."
  type        = bool
  default     = true
}

variable "nat_static_ip_count" {
  description = "IP fijas de salida (0 = IP automáticas). Úsalas solo si una integración exige lista blanca de IP."
  type        = number
  default     = 0
  validation {
    condition     = var.nat_static_ip_count >= 0 && var.nat_static_ip_count <= 4
    error_message = "Entre 0 y 4 IP fijas."
  }
}

variable "flow_logs" {
  description = "Activa los VPC Flow Logs de la subred (cuestan por volumen; útil para diagnosticar)."
  type        = bool
  default     = false
}
