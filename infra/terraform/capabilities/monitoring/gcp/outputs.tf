output "notification_channel_ids" {
  description = "Canales de notificación (los usa el presupuesto)."
  value       = module.this.notification_channel_ids
}

output "uptime_check_ids" {
  description = "Clave → ID del chequeo de disponibilidad."
  value       = module.this.uptime_check_ids
}
