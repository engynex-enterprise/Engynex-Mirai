output "handles" {
  description = "Clave → { arn, name } del rol (lo consumen container-service y scheduler de AWS)."
  value       = { for k, r in aws_iam_role.this : k => { arn = r.arn, name = r.name } }
}

output "principals" {
  description = "Clave → ARN del rol (accessors de secretos, writers de buckets, enqueuers de colas)."
  value       = { for k, r in aws_iam_role.this : k => r.arn }
}

output "ids" {
  description = "Clave → nombre del rol."
  value       = { for k, r in aws_iam_role.this : k => r.name }
}
