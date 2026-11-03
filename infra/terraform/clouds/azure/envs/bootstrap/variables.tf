variable "subscription_id" {
  description = "Suscripción de Azure de Mirai."
  type        = string
}

variable "tenant_id" {
  description = "Tenant de Entra ID."
  type        = string
}

variable "region" {
  description = "Región principal (estado, ACR y grupos de recursos)."
  type        = string
  default     = "eastus2"
}

variable "cicd_resource_group_name" {
  description = "Grupo de recursos de CI/CD (estado y ACR)."
  type        = string
  default     = "mirai-cicd-rg"
}

variable "state_storage_account_name" {
  description = "Cuenta de almacenamiento del estado (3–24 minúsculas y números, única en Azure)."
  type        = string
  validation {
    condition     = can(regex("^[a-z0-9]{3,24}$", var.state_storage_account_name))
    error_message = "3 a 24 minúsculas o números."
  }
}

variable "registry_name" {
  description = "Nombre del ACR (alfanumérico, 5–50, único en Azure). null = mirai<hash de la suscripción>."
  type        = string
  default     = null
}

variable "registry_sku" {
  description = "Standard o Premium (Premium: borrado automático de manifiestos sin etiqueta y redes privadas)."
  type        = string
  default     = "Standard"
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
  description = "ID numérico del repositorio (gh api repos/<dueño>/<repo> --jq .id)."
  type        = string
  default     = null
}

variable "cicd_budget_amount" {
  description = "Presupuesto mensual del grupo de CI/CD (USD)."
  type        = number
  default     = 30
}

variable "alert_email" {
  description = "Correo que recibe el aviso del presupuesto de CI/CD."
  type        = string
}
