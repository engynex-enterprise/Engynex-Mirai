output "notification_channel_ids" {
  description = "ARN del tema de SNS de alertas (lo usa el presupuesto)."
  value       = [aws_sns_topic.this.arn]
}

output "uptime_check_ids" {
  description = "Clave → ID del chequeo de Route 53."
  value       = { for k, h in aws_route53_health_check.this : k => h.id }
}
