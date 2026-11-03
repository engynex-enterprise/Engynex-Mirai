output "trigger_ids" {
  description = "Clave → ID del disparador."
  value       = { for k, t in google_cloudbuild_trigger.this : k => t.trigger_id }
}

output "trigger_names" {
  description = "Clave → nombre del disparador."
  value       = { for k, t in google_cloudbuild_trigger.this : k => t.name }
}
