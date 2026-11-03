variable "region" {
  description = "Región principal (ECR y estado). La misma de los ambientes."
  type        = string
  default     = "us-east-1"
}

variable "state_bucket_name" {
  description = "Nombre global único del bucket del estado de Terraform."
  type        = string
  validation {
    condition     = can(regex("^[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]$", var.state_bucket_name))
    error_message = "Nombre de bucket no válido."
  }
}

variable "registry_name" {
  description = "Prefijo de los repositorios de ECR (<name>/web, <name>/api)."
  type        = string
  default     = "mirai"
}

variable "registry_readers" {
  description = "Cuentas o roles que pueden descargar imágenes (otras cuentas de ambiente). Clave → ARN."
  type        = map(string)
  default     = {}
}

variable "github_owner" {
  description = "Dueño del repositorio en GitHub."
  type        = string
}

variable "github_repository" {
  description = "Nombre del repositorio."
  type        = string
  default     = "mirai"
}

variable "github_repository_id" {
  description = "ID numérico del repositorio (documental en AWS: IAM no admite condiciones sobre repository_id)."
  type        = string
  default     = null
}

variable "existing_github_oidc_provider_arn" {
  description = "ARN de un proveedor OIDC de GitHub que ya exista en la cuenta (solo puede haber uno). null = crearlo."
  type        = string
  default     = null
}

variable "tf_apply_policy_arn" {
  description = "Política de los roles de apply. Por defecto AdministratorAccess (temporal: cámbiala por una propia cuando el ambiente esté estable)."
  type        = string
  default     = "arn:aws:iam::aws:policy/AdministratorAccess"
}
