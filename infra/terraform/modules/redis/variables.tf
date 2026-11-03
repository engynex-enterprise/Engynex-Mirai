variable "project_id" {
  description = "Proyecto del ambiente."
  type        = string
}

variable "region" {
  description = "Región de la instancia."
  type        = string
}

variable "name" {
  description = "Nombre de la instancia (mirai-<ambiente>-redis)."
  type        = string
}

variable "labels" {
  description = "Etiquetas."
  type        = map(string)
  default     = {}
}

variable "tier" {
  description = "BASIC (una zona, sin réplica; suficiente para el adaptador de socket.io y la presencia) o STANDARD_HA."
  type        = string
  default     = "BASIC"
  validation {
    condition     = contains(["BASIC", "STANDARD_HA"], var.tier)
    error_message = "tier debe ser BASIC o STANDARD_HA."
  }
}

variable "memory_size_gb" {
  description = "Memoria en GB (1 GB alcanza para pub/sub de socket.io y presencia con TTL)."
  type        = number
  default     = 1
  validation {
    condition     = var.memory_size_gb >= 1 && var.memory_size_gb <= 300
    error_message = "Entre 1 y 300 GB."
  }
}

variable "redis_version" {
  description = "Versión de Redis."
  type        = string
  default     = "REDIS_7_2"
}

variable "authorized_network" {
  description = "ID de la VPC."
  type        = string
}

variable "reserved_ip_range" {
  description = "Nombre del rango de Private Services Access."
  type        = string
  default     = null
}
