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

# ── budget: presupuesto mensual con avisos (avisa, no corta el gasto). GCP: Billing budget; AWS: AWS Budgets;
#    Azure: Consumption budget del grupo de recursos.

variable "name" {
  description = "Nombre del presupuesto."
  type        = string
}

variable "billing_scope" {
  description = "Alcance: GCP = cuenta de facturación (XXXXXX-XXXXXX-XXXXXX); AWS = null (la cuenta); Azure = id del grupo de recursos o de la suscripción."
  type        = string
  default     = null
}

variable "amount" {
  description = "Presupuesto mensual en la moneda de la facturación."
  type        = number
  validation {
    condition     = var.amount > 0
    error_message = "El presupuesto debe ser mayor que cero."
  }
}

variable "currency" {
  description = "Moneda (USD o COP; AWS y Azure facturan en USD)."
  type        = string
  default     = "USD"
  validation {
    condition     = contains(["USD", "COP"], var.currency)
    error_message = "Usa USD o COP."
  }
}

variable "thresholds" {
  description = "Porcentajes (0-1) del gasto real que avisan."
  type        = list(number)
  default     = [0.5, 0.8, 1.0]
}

variable "forecast_threshold" {
  description = "Aviso cuando el pronóstico del mes supere este porcentaje."
  type        = number
  default     = 1.0
}

variable "notification_emails" {
  description = "Correos que reciben el aviso (clave fija → correo)."
  type        = map(string)
  default     = {}
}

variable "notification_channel_ids" {
  description = "Canales de la capacidad monitoring (GCP: canales de Cloud Monitoring; AWS: temas SNS; Azure: grupos de acciones)."
  type        = list(string)
  default     = []
}
