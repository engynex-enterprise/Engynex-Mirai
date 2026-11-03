output "provider_id" {
  description = "ARN del proveedor OIDC de GitHub."
  value       = local.provider_arn
}

output "principals" {
  description = "Clave → ARN del rol (role-to-assume de aws-actions/configure-aws-credentials)."
  value       = { for k, r in aws_iam_role.this : k => r.arn }
}

output "ids" {
  description = "Clave → ARN del rol."
  value       = { for k, r in aws_iam_role.this : k => r.arn }
}
