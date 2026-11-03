variable "project_id" {
  description = "Proyecto del ambiente (Identity Platform se activa por proyecto y no se puede desactivar del todo)."
  type        = string
}

variable "authorized_domains" {
  description = "Dominios desde los que se permite iniciar sesión (web del ambiente y localhost para desarrollo)."
  type        = list(string)
}

variable "google_client_id" {
  description = "Client ID de OAuth de Google para \"Entrar con Google\" (null = sin proveedor Google)."
  type        = string
  default     = null
}

variable "google_client_secret" {
  description = "Client secret de OAuth (se lee de Secret Manager en el stack; queda en el estado de Terraform)."
  type        = string
  default     = null
  sensitive   = true
}

variable "totp_mfa" {
  description = "Segundo factor con app de autenticación (TOTP), como hoy en Supabase."
  type        = bool
  default     = true
}

variable "sms_allowed_regions" {
  description = "Países permitidos para SMS (protección contra fraude de SMS aunque no se use el SMS)."
  type        = list(string)
  default     = ["CO"]
}
