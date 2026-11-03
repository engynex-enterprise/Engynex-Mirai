output "refs" {
  description = "Clave → ARN del secreto (valueFrom en la definición de tarea de ECS)."
  value       = { for k, s in aws_secretsmanager_secret.this : k => s.arn }
}

output "ids" {
  description = "Clave → nombre del secreto (para cargar valores con aws secretsmanager put-secret-value)."
  value       = { for k, s in aws_secretsmanager_secret.this : k => s.name }
}
