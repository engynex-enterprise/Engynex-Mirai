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

# ── secrets: almacén de secretos (GCP: Secret Manager; AWS: Secrets Manager; Azure: Key Vault). Terraform crea el
#    contenedor y los permisos; los valores se cargan aparte (docs/infra/runbook.md) salvo los que genera la propia
#    infraestructura (generated_values: URL de la base, Redis, secretos internos).

variable "secrets" {
  description = "Secretos: clave corta (encryption-key…) → descripción y quién lo lee (accessors = clave fija → principal de identity)."
  type = map(object({
    description = string
    accessors   = optional(map(string), {})
    labels      = optional(map(string), {})
  }))
  validation {
    condition     = alltrue([for k in keys(var.secrets) : can(regex("^[a-z0-9][a-z0-9-]{1,60}$", k))])
    error_message = "Las claves usan minúsculas, números y guiones (máx. 61)."
  }
}

variable "generated_values" {
  description = "Valores que genera la infraestructura (clave existente en secrets → valor). Quedan en el estado de Terraform (bucket privado y cifrado)."
  type        = map(string)
  default     = {}
  sensitive   = true
}
