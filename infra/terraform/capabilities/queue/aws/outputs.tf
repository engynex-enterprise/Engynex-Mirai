output "driver" {
  description = "sqs (colas de SQS) o pg (cola en Postgres)."
  value       = var.enabled ? "sqs" : "http"
}

output "queue_names" {
  description = "Id literal → nombre de la cola."
  value       = { for k, q in aws_sqs_queue.this : k => q.name }
}

output "queue_ids" {
  description = "Id literal → ARN de la cola."
  value       = { for k, q in aws_sqs_queue.this : k => q.arn }
}

output "env" {
  description = "Variables para la API y el worker: QUEUE_DRIVER=sqs, AWS_REGION y QUEUE_<COLA> = URL de la cola (o QUEUE_DRIVER=http)."
  value = var.enabled ? merge(
    { QUEUE_DRIVER = "sqs", AWS_REGION = var.context.region },
    { for k, q in aws_sqs_queue.this : "QUEUE_${upper(replace(k, "-", "_"))}" => q.url },
  ) : { QUEUE_DRIVER = "http" }
}
