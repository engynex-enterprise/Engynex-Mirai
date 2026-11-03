variable "project_id" {
  description = "Proyecto donde se crean las cuentas de servicio."
  type        = string
}

variable "prefix" {
  description = "Prefijo del account_id (mirai-<ambiente>; se acorta para no pasar de 30 caracteres)."
  type        = string
}

variable "service_accounts" {
  description = <<-EOT
    Cuentas de servicio por servicio (mínimo privilegio). Clave = sufijo (web, api, realtime, scheduler…).
    project_roles = roles a nivel de proyecto (solo los imprescindibles; los permisos finos van sobre cada recurso).
  EOT
  type = map(object({
    display_name  = string
    description   = optional(string, "")
    project_roles = optional(list(string), [])
  }))
  validation {
    condition     = alltrue([for k in keys(var.service_accounts) : can(regex("^[a-z][a-z0-9-]{1,14}$", k))])
    error_message = "Sufijos de 2 a 15 caracteres: minúsculas, números y guiones."
  }
}
