variable "billing_account" {
  description = "ID de la cuenta de facturación (XXXXXX-XXXXXX-XXXXXX)."
  type        = string
  validation {
    condition     = can(regex("^[0-9A-F]{6}-[0-9A-F]{6}-[0-9A-F]{6}$", var.billing_account))
    error_message = "Formato XXXXXX-XXXXXX-XXXXXX (hexadecimal en mayúsculas)."
  }
}

variable "project_number" {
  description = "Número del proyecto que vigila el presupuesto."
  type        = string
}

variable "display_name" {
  description = "Nombre del presupuesto."
  type        = string
}

variable "amount" {
  description = "Presupuesto mensual en la moneda de la cuenta de facturación."
  type        = number
  validation {
    condition     = var.amount > 0
    error_message = "El presupuesto debe ser mayor que cero."
  }
}

variable "currency_code" {
  description = "Moneda de la cuenta de facturación (USD o COP). Debe coincidir con la de la cuenta."
  type        = string
  default     = "USD"
  validation {
    condition     = contains(["USD", "COP"], var.currency_code)
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

variable "notification_channel_ids" {
  description = "Canales de Cloud Monitoring (correo) que reciben el aviso, además de los administradores de facturación."
  type        = list(string)
  default     = []
}
