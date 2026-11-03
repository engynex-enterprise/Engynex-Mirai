variable "project_id" {
  description = "Proyecto donde vive el pool de identidades (el de CI/CD)."
  type        = string
}

variable "pool_id" {
  description = "ID del pool."
  type        = string
  default     = "github"
}

variable "provider_id" {
  description = "ID del proveedor OIDC."
  type        = string
  default     = "github-actions"
}

variable "github_owner" {
  description = "Dueño (organización o usuario) del repositorio en GitHub."
  type        = string
}

variable "github_repository" {
  description = "Nombre del repositorio (sin el dueño)."
  type        = string
}

variable "github_repository_id" {
  description = "ID numérico del repositorio (evita que otro repositorio con el mismo nombre, tras un renombre, herede el acceso). null = solo por nombre."
  type        = string
  default     = null
}

variable "service_accounts" {
  description = <<-EOT
    Cuentas que GitHub Actions puede usar sin llaves. Clave = account_id.
    refs = ramas o refs permitidas (vacío = cualquiera del repositorio, p. ej. para planes en PR).
    environments = entornos de GitHub permitidos (p. ej. "produccion" con revisores obligatorios).
  EOT
  type = map(object({
    display_name = string
    refs         = optional(list(string), [])
    environments = optional(list(string), [])
  }))
}
