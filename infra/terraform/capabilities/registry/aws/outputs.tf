output "registry_url" {
  description = "Ruta base de las imágenes: <cuenta>.dkr.ecr.<región>.amazonaws.com/<name> (se le suma /web, /api…)."
  value       = "${data.aws_caller_identity.this.account_id}.dkr.ecr.${var.context.region}.amazonaws.com/${var.name}"
}

output "id" {
  description = "ID del registro (la cuenta)."
  value       = data.aws_caller_identity.this.account_id
}

output "name" {
  description = "Prefijo de los repositorios."
  value       = var.name
}
