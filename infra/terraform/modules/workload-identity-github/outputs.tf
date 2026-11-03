output "provider_name" {
  description = "Nombre completo del proveedor (workload_identity_provider en google-github-actions/auth)."
  value       = google_iam_workload_identity_pool_provider.github.name
}

output "service_account_emails" {
  description = "account_id → correo."
  value       = { for k, sa in google_service_account.this : k => sa.email }
}

output "service_account_members" {
  description = "account_id → miembro IAM."
  value       = { for k, sa in google_service_account.this : k => "serviceAccount:${sa.email}" }
}
