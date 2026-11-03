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

# ── identity: una identidad de carga de trabajo por servicio, sin llaves (GCP: cuentas de servicio; AWS: roles de IAM
#    para tareas de ECS; Azure: identidades administradas asignadas por el usuario).

variable "identities" {
  description = <<-EOT
    Identidades: clave corta (web, api, realtime, worker, postgrest, scheduler, tasks, migrator) → descripción y permisos
    abstractos que cada nube traduce: logs, metrics, traces, errors, sql (conectarse a la base con IAM), ai (modelos
    administrados: Vertex, Bedrock, Azure OpenAI), idp (administrar el IdP administrado, solo si se usa).
  EOT
  type = map(object({
    display_name = string
    description  = optional(string, "")
    capabilities = optional(list(string), [])
  }))
  validation {
    condition     = alltrue([for k in keys(var.identities) : can(regex("^[a-z][a-z0-9-]{1,14}$", k))])
    error_message = "Claves de 2 a 15 caracteres: minúsculas, números y guiones."
  }
  validation {
    condition     = alltrue(flatten([for v in values(var.identities) : [for c in v.capabilities : contains(["logs", "metrics", "traces", "errors", "sql", "ai", "idp"], c)]]))
    error_message = "Permisos abstractos válidos: logs, metrics, traces, errors, sql, ai, idp."
  }
}
