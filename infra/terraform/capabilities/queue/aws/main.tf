# queue/aws: una cola SQS por id literal (notify, automations, slow) con su DLQ; las consume MODE=worker
# (QUEUE_DRIVER=sqs). enabled = false → no se crea nada y la API usa la cola en Postgres (QUEUE_DRIVER=pg).
# Traducción: max_attempts → maxReceiveCount de la redrive policy; max_retry_s → retención (mín. 1 h);
# max_per_second/max_concurrent/backoff los aplica el worker (SQS no limita la tasa de entrega); target se ignora
# (SQS no empuja por HTTP). enqueuers/consumers = ARN de roles.
# cloud_options: visibility_timeout_s (number, 900: lo más largo que tarda una tarea de slow).

locals {
  opts   = var.cloud_options
  queues = var.enabled ? var.queues : {}
}

resource "aws_sqs_queue" "dlq" {
  for_each                  = local.queues
  name                      = "${var.context.prefix}-${each.key}-dlq"
  message_retention_seconds = 1209600 # 14 días para revisar a mano
  sqs_managed_sse_enabled   = true
  tags                      = merge(var.context.labels, { cola = each.key })
}

resource "aws_sqs_queue" "this" {
  for_each                   = local.queues
  name                       = "${var.context.prefix}-${each.key}"
  visibility_timeout_seconds = try(local.opts.visibility_timeout_s, 900)
  message_retention_seconds  = min(1209600, max(3600, each.value.max_retry_s))
  receive_wait_time_seconds  = 20
  sqs_managed_sse_enabled    = true
  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.dlq[each.key].arn
    maxReceiveCount     = max(8, each.value.max_attempts) # el worker reintenta dentro de cada recepción; ≥ 8 antes de la DLQ
  })
  tags = merge(var.context.labels, { cola = each.key })
}

resource "aws_sqs_queue_policy" "this" {
  for_each  = length(var.enqueuers) + length(var.consumers) > 0 ? local.queues : {}
  queue_url = aws_sqs_queue.this[each.key].id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = concat(
      length(var.enqueuers) > 0 ? [{
        Sid       = "Encolar"
        Effect    = "Allow"
        Principal = { AWS = values(var.enqueuers) }
        Action    = ["sqs:SendMessage", "sqs:GetQueueAttributes", "sqs:GetQueueUrl"]
        Resource  = aws_sqs_queue.this[each.key].arn
      }] : [],
      length(var.consumers) > 0 ? [{
        Sid       = "Consumir"
        Effect    = "Allow"
        Principal = { AWS = values(var.consumers) }
        Action    = ["sqs:ReceiveMessage", "sqs:DeleteMessage", "sqs:ChangeMessageVisibility", "sqs:GetQueueAttributes", "sqs:GetQueueUrl"]
        Resource  = aws_sqs_queue.this[each.key].arn
      }] : [],
    )
  })
}
