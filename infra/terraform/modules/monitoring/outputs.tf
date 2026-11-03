output "notification_channel_ids" {
  description = "Canales de notificación (los usa el presupuesto)."
  value       = [for c in google_monitoring_notification_channel.email : c.id]
}

output "uptime_check_ids" {
  description = "Clave → ID del chequeo de disponibilidad."
  value       = { for k, u in google_monitoring_uptime_check_config.this : k => u.uptime_check_id }
}
