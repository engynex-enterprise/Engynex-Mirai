output "ids" {
  description = "Nombre corto → ID completo (projects/<p>/secrets/<id>)."
  value       = { for k, s in google_secret_manager_secret.this : k => s.id }
}

output "secret_ids" {
  description = "Nombre corto → secret_id (lo que usa Cloud Run en secret_key_ref)."
  value       = { for k, s in google_secret_manager_secret.this : k => s.secret_id }
}
