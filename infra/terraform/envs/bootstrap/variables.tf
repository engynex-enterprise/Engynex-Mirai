variable "projects" {
  description = "IDs de los tres proyectos: cicd (estado, imágenes, Cloud Build, WIF), pruebas y produccion."
  type = object({
    cicd       = string
    pruebas    = string
    produccion = string
  })
  validation {
    condition     = alltrue([for p in values(var.projects) : can(regex("^[a-z][a-z0-9-]{4,28}[a-z0-9]$", p))])
    error_message = "IDs de proyecto no válidos (6-30 caracteres, minúsculas, números y guiones)."
  }
}

variable "create_projects" {
  description = "true = Terraform crea los proyectos (necesita resourcemanager.projectCreator en la organización o carpeta y billing.user). false = ya existen."
  type        = bool
  default     = false
}

variable "org_id" {
  description = "ID numérico de la organización (solo si create_projects y no hay carpeta)."
  type        = string
  default     = null
}

variable "folder_id" {
  description = "ID de la carpeta donde crear los proyectos (opcional; tiene prioridad sobre org_id)."
  type        = string
  default     = null
}

variable "billing_account" {
  description = "Cuenta de facturación (XXXXXX-XXXXXX-XXXXXX)."
  type        = string
  validation {
    condition     = can(regex("^[0-9A-F]{6}-[0-9A-F]{6}-[0-9A-F]{6}$", var.billing_account))
    error_message = "Formato XXXXXX-XXXXXX-XXXXXX."
  }
}

variable "region" {
  description = "Región principal (Artifact Registry, conexión de Cloud Build). La misma de los ambientes."
  type        = string
  default     = "us-west1"
}

variable "state_bucket_name" {
  description = "Nombre global único del bucket del estado de Terraform."
  type        = string
  validation {
    condition     = can(regex("^[a-z0-9][a-z0-9._-]{1,61}[a-z0-9]$", var.state_bucket_name))
    error_message = "Nombre de bucket no válido."
  }
}

variable "state_bucket_location" {
  description = "Ubicación del bucket del estado (multi-región US por durabilidad)."
  type        = string
  default     = "US"
}

variable "artifact_registry_repo" {
  description = "Nombre del repositorio de imágenes."
  type        = string
  default     = "mirai"
}

variable "github_owner" {
  description = "Dueño del repositorio en GitHub (organización o usuario)."
  type        = string
}

variable "github_repository" {
  description = "Nombre del repositorio en GitHub."
  type        = string
  default     = "mirai"
}

variable "github_repository_id" {
  description = "ID numérico del repositorio (gh api repos/<dueño>/<repo> --jq .id). Recomendado."
  type        = string
  default     = null
}

variable "github_app_installation_id" {
  description = "ID de instalación de la app \"Google Cloud Build\" en GitHub. null = no crear la conexión todavía."
  type        = number
  default     = null
}

variable "github_oauth_token_secret_version" {
  description = "Versión de Secret Manager con el token OAuth de GitHub para la conexión (projects/<p>/secrets/<s>/versions/<n>)."
  type        = string
  default     = null
  validation {
    condition     = var.github_oauth_token_secret_version == null || can(regex("^projects/[^/]+/secrets/[^/]+/versions/[^/]+$", var.github_oauth_token_secret_version))
    error_message = "Formato projects/<p>/secrets/<s>/versions/<n>."
  }
}

variable "enable_ci_trigger" {
  description = "Crea el disparador de CI en Cloud Build para PR hacia pruebas y main (GitHub Actions ya corre CI; esto lo duplica en GCP)."
  type        = bool
  default     = false
}

variable "manage_org_policy_exceptions" {
  description = "Crea excepciones de política de organización en los proyectos de ambiente para el bucket público (allUsers). Requiere orgpolicy.policyAdmin."
  type        = bool
  default     = false
}

variable "grant_billing_roles" {
  description = "Da billing.costsManager a las cuentas de Terraform de los ambientes (para los presupuestos). Requiere billing.admin."
  type        = bool
  default     = false
}

variable "cicd_budget_amount" {
  description = "Presupuesto mensual del proyecto de CI/CD en la moneda de la cuenta."
  type        = number
  default     = 30
}

variable "budget_currency" {
  description = "Moneda de la cuenta de facturación (USD o COP)."
  type        = string
  default     = "USD"
}

variable "alert_email" {
  description = "Correo que recibe el aviso del presupuesto del proyecto de CI/CD."
  type        = string
}
