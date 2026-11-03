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

# ── edge: borde público del ambiente: balanceador/CDN + certificado administrado + WAF + reglas por dominio y camino
#    (mismo origen: /v1/* y /api/auth/* → api, /socket.io/* → realtime, /* → web; files. → bucket público).
#    GCP: Application Load Balancer + Cloud CDN + Cloud Armor + Certificate Manager; AWS: CloudFront + WAF + ACM delante
#    del ALB interno; Azure: Front Door Premium + WAF + certificados administrados.

variable "name" {
  description = "Prefijo de los recursos del borde (mirai-<ambiente>)."
  type        = string
}

variable "origins" {
  description = "Orígenes de contenedores: clave (web, api, realtime, canary-web…) → handle edge_origin de container-service, CDN (respeta Cache-Control del origen: /_next/static immutable, páginas private) y WAF."
  type = map(object({
    origin          = any
    cdn             = optional(bool, false)
    waf             = optional(bool, true)
    log_sample_rate = optional(number, 1.0)
  }))
  validation {
    condition     = alltrue([for k in keys(var.origins) : can(regex("^[a-z][a-z0-9-]{0,20}$", k))])
    error_message = "Claves de origen: minúsculas, números y guiones, máx. 21."
  }
}

variable "bucket_origins" {
  description = "Orígenes de archivos públicos: clave (files) → handle public_origin de object-storage y TTL del CDN."
  type = map(object({
    origin      = any
    default_ttl = optional(number, 3600)
    max_ttl     = optional(number, 604800)
  }))
  default = {}
}

variable "hosts" {
  description = "Dominio → clave de origen (de origins o bucket_origins)."
  type        = map(string)
}

variable "routes" {
  description = "Reglas por camino dentro de un dominio (mismo origen): { hosts, paths (/v1/*), origin }. Lo que no coincide va al origen del dominio en hosts."
  type = list(object({
    hosts  = list(string)
    paths  = list(string)
    origin = string
  }))
  default = []
}

variable "default_origin" {
  description = "Origen para dominios que no estén en hosts (normalmente web)."
  type        = string
  default     = "web"
}

variable "certificate_domains" {
  description = "Dominios del certificado administrado (p. ej. [\"mirai.engynex.com\", \"*.mirai.engynex.com\"])."
  type        = list(string)
}

variable "dns_authorization_domains" {
  description = "Dominios con validación por DNS (CNAME/TXT que se crean en Hostinger antes de mover el DNS)."
  type        = list(string)
}

variable "waf" {
  description = "WAF y límites: vista previa (solo registra) o exigir, sensibilidad, límites por IP (general, IA/chat y webhooks de pagos sin WAF) y listas de IP."
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
    condition     = var.waf.waf_sensitivity >= 1 && var.waf.waf_sensitivity <= 4
    error_message = "waf_sensitivity entre 1 (menos falsos positivos) y 4."
  }
}

variable "enable_ipv6" {
  description = "Publica también IPv6 (AAAA)."
  type        = bool
  default     = false
}
