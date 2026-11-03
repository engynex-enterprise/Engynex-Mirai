output "notification_channel_ids" {
  description = "Grupos de acciones (los usa el presupuesto)."
  value       = local.ag_ids
}

output "uptime_check_ids" {
  description = "Clave → ID de la prueba web."
  value       = { for k, t in azurerm_application_insights_standard_web_test.this : k => t.id }
}
