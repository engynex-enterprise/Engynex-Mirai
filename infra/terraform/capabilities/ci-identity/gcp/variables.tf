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

# ── ci-identity: GitHub Actions entra a la nube sin llaves (OIDC). GCP: Workload Identity Federation + cuentas de
#    servicio; AWS: proveedor OIDC de IAM + roles; Azure: aplicación de Entra ID + credenciales federadas.

variable "github" {
  description = "Repositorio de GitHub (repository_id recomendado: evita que otro repo con el mismo nombre herede el acceso)."
  type = object({
    owner         = string
    repository    = string
    repository_id = optional(string)
  })
}

variable "roles" {
  description = <<-EOT
    Identidades de CI: clave (p. ej. mirai-tf-plan, mirai-tf-pruebas, mirai-deploy-produccion) → quién puede usarla:
    refs (ramas, refs/heads/main), environments (entornos de GitHub con revisores) y pull_requests. Sin refs ni
    environments = cualquier ejecución del repositorio (solo para lectura).
  EOT
  type = map(object({
    display_name  = string
    refs          = optional(list(string), [])
    environments  = optional(list(string), [])
    pull_requests = optional(bool, false)
  }))
  validation {
    condition     = alltrue([for k in keys(var.roles) : can(regex("^[a-z][a-z0-9-]{4,28}[a-z0-9]$", k))])
    error_message = "Claves de 6 a 30 caracteres: minúsculas, números y guiones."
  }
}
