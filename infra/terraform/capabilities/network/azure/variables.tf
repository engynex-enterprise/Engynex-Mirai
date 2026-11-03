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

# ── network: red privada del ambiente (VPC / VNet), salida a internet (NAT) y acceso privado a servicios administrados.

variable "cidr" {
  description = "Espacio de direcciones. GCP: rango de la subred de Cloud Run (/26 o mayor). AWS: CIDR de la VPC (se parte en subredes públicas y privadas). Azure: espacio de la VNet (se parte en subredes delegadas)."
  type        = string
  validation {
    condition     = can(cidrhost(var.cidr, 0)) && tonumber(split("/", var.cidr)[1]) <= 26
    error_message = "cidr debe ser un CIDR válido de tamaño /26 o mayor."
  }
}

variable "zones" {
  description = "Zonas de disponibilidad a usar (AWS: subredes por zona; Azure y GCP la ignoran: sus servicios son regionales)."
  type        = number
  default     = 2
  validation {
    condition     = var.zones >= 1 && var.zones <= 3
    error_message = "Entre 1 y 3 zonas."
  }
}

variable "nat" {
  description = "Salida a internet por NAT (IA, pasarelas de pago, Meta, Telegram)."
  type        = bool
  default     = true
}

variable "nat_static_ip_count" {
  description = "IP fijas de salida (0 = automáticas). Solo si una integración exige lista blanca de IP."
  type        = number
  default     = 0
  validation {
    condition     = var.nat_static_ip_count >= 0 && var.nat_static_ip_count <= 4
    error_message = "Entre 0 y 4 IP fijas."
  }
}

variable "private_services" {
  description = "Acceso privado a la base y a Redis (GCP: Private Services Access; AWS: grupos de subredes privadas; Azure: subredes delegadas y DNS privado)."
  type        = bool
  default     = true
}

variable "flow_logs" {
  description = "Registros de flujo de la red (cuestan por volumen; para diagnosticar)."
  type        = bool
  default     = false
}
