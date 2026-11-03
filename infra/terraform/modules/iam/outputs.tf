output "emails" {
  description = "Sufijo → correo de la cuenta de servicio."
  value       = { for k, sa in google_service_account.this : k => sa.email }
}

output "members" {
  description = "Sufijo → miembro IAM (serviceAccount:<correo>)."
  value       = { for k, sa in google_service_account.this : k => "serviceAccount:${sa.email}" }
}

output "ids" {
  description = "Sufijo → ID completo (projects/<p>/serviceAccounts/<correo>), para iam_member sobre la cuenta."
  value       = { for k, sa in google_service_account.this : k => sa.name }
}
