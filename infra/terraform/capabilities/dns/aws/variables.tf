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

# ── dns: zona DNS administrada (opcional: hoy el DNS de engynex.com vive en Hostinger y los registros se crean a mano
#    con la salida dns_records del borde). Sirve el día que se delegue mirai.engynex.com a la nube.

variable "zone_name" {
  description = "Dominio de la zona (p. ej. mirai.engynex.com), sin punto final."
  type        = string
}

variable "create_zone" {
  description = "true = crea la zona (luego se delega con NS en Hostinger). false = usa una zona existente con ese nombre."
  type        = bool
  default     = true
}

variable "records" {
  description = "Registros: name (FQDN sin punto final), type (A, AAAA, CNAME, TXT, MX), ttl y valores."
  type = list(object({
    name   = string
    type   = string
    ttl    = optional(number, 300)
    values = list(string)
  }))
  default = []
  validation {
    condition     = alltrue([for r in var.records : contains(["A", "AAAA", "CNAME", "TXT", "MX", "CAA"], r.type)])
    error_message = "Tipos admitidos: A, AAAA, CNAME, TXT, MX, CAA."
  }
}
