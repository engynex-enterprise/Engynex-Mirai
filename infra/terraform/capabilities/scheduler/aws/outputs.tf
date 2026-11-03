output "job_ids" {
  description = "Clave → ARN de la programación de EventBridge Scheduler."
  value       = { for k, s in aws_scheduler_schedule.this : k => s.arn }
}
