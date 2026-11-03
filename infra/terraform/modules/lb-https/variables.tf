variable "project_id" {
  description = "Proyecto del ambiente."
  type        = string
}

variable "region" {
  description = "Región de los servicios de Cloud Run (los NEG serverless son regionales)."
  type        = string
}

variable "name" {
  description = "Prefijo de nombres (mirai-<ambiente>)."
  type        = string
}

variable "labels" {
  description = "Etiquetas (direcciones y política de Cloud Armor)."
  type        = map(string)
  default     = {}
}

variable "serverless_backends" {
  description = <<-EOT
    Backends de Cloud Run. Clave = nombre corto (web, api, realtime, canary-web…).
    tag: revisión etiquetada (p. ej. "canary") para probar una revisión nueva por el balanceador antes de darle tráfico.
    cdn: Cloud CDN con los encabezados del origen (Next marca /_next/static como immutable y las páginas como private).
  EOT
  type = map(object({
    service         = string
    tag             = optional(string)
    cdn             = optional(bool, false)
    armor           = optional(bool, true)
    log_sample_rate = optional(number, 1.0)
  }))
  validation {
    condition     = alltrue([for k in keys(var.serverless_backends) : can(regex("^[a-z][a-z0-9-]{0,20}$", k))])
    error_message = "Claves de backend: minúsculas, números y guiones, máx. 21."
  }
}

variable "bucket_backends" {
  description = "Backends de Cloud Storage con CDN (archivos públicos). Clave = nombre corto."
  type = map(object({
    bucket      = string
    default_ttl = optional(number, 3600)
    max_ttl     = optional(number, 604800)
  }))
  default = {}
}

variable "host_rules" {
  description = "Dominio → clave del backend (serverless o bucket)."
  type        = map(string)
}

variable "default_backend" {
  description = "Backend para dominios que no estén en host_rules (normalmente web)."
  type        = string
}

variable "certificate_domains" {
  description = "Dominios del certificado administrado (p. ej. [\"mirai.engynex.com\", \"*.mirai.engynex.com\"])."
  type        = list(string)
}

variable "dns_authorization_domains" {
  description = "Dominios con autorización DNS (un CNAME _acme-challenge cada uno). Permite emitir el certificado antes de mover el DNS desde Vercel."
  type        = list(string)
}

variable "enable_ipv6" {
  description = "Reserva también una IPv6 (registro AAAA)."
  type        = bool
  default     = false
}

variable "armor" {
  description = "Cloud Armor: WAF (empieza en vista previa), límites por IP y listas de IP."
  type = object({
    waf_preview                     = optional(bool, true)
    waf_sensitivity                 = optional(number, 1)
    rate_limit_per_minute           = optional(number, 1200)
    sensitive_rate_limit_per_minute = optional(number, 60)
    webhook_rate_limit_per_minute   = optional(number, 300)
    deny_ip_ranges                  = optional(list(string), [])
    allow_ip_ranges                 = optional(list(string), [])
    adaptive_protection             = optional(bool, false)
  })
  default = {}
  validation {
    condition     = var.armor.waf_sensitivity >= 1 && var.armor.waf_sensitivity <= 4
    error_message = "waf_sensitivity entre 1 (menos falsos positivos) y 4."
  }
}
