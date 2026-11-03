output "handles" {
  description = "Clave → { email, member, id } de cada cuenta de servicio."
  value       = { for k in keys(var.identities) : k => { email = module.this.emails[k], member = module.this.members[k], id = module.this.ids[k] } }
}

output "principals" {
  description = "Clave → serviceAccount:<correo> (miembro IAM)."
  value       = module.this.members
}

output "ids" {
  description = "Clave → correo de la cuenta de servicio."
  value       = module.this.emails
}
