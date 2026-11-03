output "provider_id" {
  description = "workload_identity_provider para google-github-actions/auth."
  value       = module.this.provider_name
}

output "principals" {
  description = "Clave → serviceAccount:<correo>."
  value       = module.this.service_account_members
}

output "ids" {
  description = "Clave → correo de la cuenta (service_account en google-github-actions/auth)."
  value       = module.this.service_account_emails
}
