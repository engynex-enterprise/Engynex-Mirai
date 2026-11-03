# monitoring/aws: tema de SNS con suscripción por correo (cada persona confirma el correo de AWS) y alarmas de
# CloudWatch: 5xx (proporción) y latencia p95 por grupo de destino del ALB, CPU de los servicios sin ALB, RDS (CPU,
# memoria libre, disco libre), ElastiCache (memoria), profundidad de SQS, errores en los registros (pino: level >= 50)
# y chequeos de disponibilidad de Route 53 (sus métricas solo existen en us-east-1: alarma y tema SNS allá).
#
# cloud_options (los pone el stack):
#   target_groups  = map(servicio → { target_group = arn_suffix, load_balancer = arn_suffix }) para 5xx y latencia.
#   cluster_name   = clúster de ECS (CPU de servicios sin grupo de destino).
#   log_group_name = grupo de registros de los contenedores (métrica de errores).

locals {
  opts = var.cloud_options
  # Las llaves de for_each salen de los NOMBRES de las claves (conocidos al planear), no de sus valores (ARN que se
  # conocen después de crear los recursos).
  opt_keys  = keys(local.opts)
  tgs       = contains(local.opt_keys, "target_groups") ? local.opts.target_groups : {}
  tg_keys   = contains(local.opt_keys, "target_groups") ? keys(local.opts.target_groups) : []
  cluster   = contains(local.opt_keys, "cluster_name") ? local.opts.cluster_name : null
  log_group = contains(local.opt_keys, "log_group_name") ? local.opts.log_group_name : null
  topic     = [aws_sns_topic.this.arn]
  lb_svcs   = { for k, v in var.services : k => v if contains(local.tg_keys, k) }
  cpu_svcs  = contains(local.opt_keys, "cluster_name") ? { for k, v in var.services : k => v if !contains(local.tg_keys, k) } : {}
  lat_svcs  = { for k, v in local.lb_svcs : k => v if v.latency_p95_ms != null }
  desc      = "Mirai ${var.context.prefix}. Qué hacer: ${var.runbook_url} (sección Incidentes)."
}

resource "aws_sns_topic" "this" {
  name = "${var.context.prefix}-alertas"
  tags = var.context.labels
}

# Presupuestos (budgets.amazonaws.com) y CloudWatch publican en el tema.
resource "aws_sns_topic_policy" "this" {
  arn = aws_sns_topic.this.arn
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid       = "AlarmasYPresupuestos"
      Effect    = "Allow"
      Principal = { Service = ["budgets.amazonaws.com", "cloudwatch.amazonaws.com"] }
      Action    = "SNS:Publish"
      Resource  = aws_sns_topic.this.arn
    }]
  })
}

resource "aws_sns_topic_subscription" "email" {
  for_each  = var.notification_emails
  topic_arn = aws_sns_topic.this.arn
  protocol  = "email"
  endpoint  = each.value
}

# ── Servicios detrás del ALB ────────────────────────────────────────────────────────────────────────────────────
resource "aws_cloudwatch_metric_alarm" "errors_5xx" {
  for_each            = local.lb_svcs
  alarm_name          = "${each.key}: errores 5xx > ${each.value.error_ratio * 100} %"
  alarm_description   = local.desc
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 5
  threshold           = each.value.error_ratio
  treat_missing_data  = "notBreaching"
  alarm_actions       = local.topic
  ok_actions          = local.topic

  metric_query {
    id          = "proporcion"
    expression  = "IF(peticiones > 0, errores / peticiones, 0)"
    label       = "Proporción de 5xx"
    return_data = true
  }

  metric_query {
    id = "errores"
    metric {
      namespace   = "AWS/ApplicationELB"
      metric_name = "HTTPCode_Target_5XX_Count"
      period      = 60
      stat        = "Sum"
      dimensions  = { TargetGroup = local.tgs[each.key].target_group, LoadBalancer = local.tgs[each.key].load_balancer }
    }
  }

  metric_query {
    id = "peticiones"
    metric {
      namespace   = "AWS/ApplicationELB"
      metric_name = "RequestCount"
      period      = 60
      stat        = "Sum"
      dimensions  = { TargetGroup = local.tgs[each.key].target_group, LoadBalancer = local.tgs[each.key].load_balancer }
    }
  }

  tags = var.context.labels
}

resource "aws_cloudwatch_metric_alarm" "latency" {
  for_each            = local.lat_svcs
  alarm_name          = "${each.key}: latencia p95 > ${each.value.latency_p95_ms} ms"
  alarm_description   = local.desc
  namespace           = "AWS/ApplicationELB"
  metric_name         = "TargetResponseTime"
  extended_statistic  = "p95"
  period              = 300
  evaluation_periods  = 2
  threshold           = each.value.latency_p95_ms / 1000
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"
  dimensions          = { TargetGroup = local.tgs[each.key].target_group, LoadBalancer = local.tgs[each.key].load_balancer }
  alarm_actions       = local.topic
  tags                = var.context.labels
}

resource "aws_cloudwatch_metric_alarm" "cpu" {
  for_each            = local.cpu_svcs
  alarm_name          = "${each.key}: CPU > 85 %"
  alarm_description   = local.desc
  namespace           = "AWS/ECS"
  metric_name         = "CPUUtilization"
  statistic           = "Average"
  period              = 300
  evaluation_periods  = 3
  threshold           = 85
  comparison_operator = "GreaterThanThreshold"
  dimensions          = { ClusterName = local.cluster, ServiceName = each.key }
  alarm_actions       = local.topic
  tags                = var.context.labels
}

# ── Postgres (RDS) ──────────────────────────────────────────────────────────────────────────────────────────────
locals {
  rds_alarms = var.postgres_id == null ? {} : {
    cpu     = { metric = "CPUUtilization", op = "GreaterThanThreshold", threshold = 80, name = "CPU > 80 %" }
    memoria = { metric = "FreeableMemory", op = "LessThanThreshold", threshold = 256 * 1024 * 1024, name = "memoria libre < 256 MB" }
    disco   = { metric = "FreeStorageSpace", op = "LessThanThreshold", threshold = 2 * 1024 * 1024 * 1024, name = "disco libre < 2 GB" }
  }
}

resource "aws_cloudwatch_metric_alarm" "rds" {
  for_each            = local.rds_alarms
  alarm_name          = "RDS ${coalesce(var.postgres_id, "-")}: ${each.value.name}"
  alarm_description   = local.desc
  namespace           = "AWS/RDS"
  metric_name         = each.value.metric
  statistic           = "Average"
  period              = 300
  evaluation_periods  = 2
  threshold           = each.value.threshold
  comparison_operator = each.value.op
  dimensions          = { DBInstanceIdentifier = coalesce(var.postgres_id, "-") }
  alarm_actions       = local.topic
  tags                = var.context.labels
}

# ── Redis (ElastiCache: la métrica es por nodo; se vigila el primario <id>-001) ─────────────────────────────────
resource "aws_cloudwatch_metric_alarm" "redis_memory" {
  count               = var.redis_id == null ? 0 : 1
  alarm_name          = "${var.context.prefix} Redis: memoria > 80 %"
  alarm_description   = local.desc
  namespace           = "AWS/ElastiCache"
  metric_name         = "DatabaseMemoryUsagePercentage"
  statistic           = "Average"
  period              = 300
  evaluation_periods  = 2
  threshold           = 80
  comparison_operator = "GreaterThanThreshold"
  dimensions          = { CacheClusterId = "${coalesce(var.redis_id, "-")}-001" }
  alarm_actions       = local.topic
  tags                = var.context.labels
}

# ── Colas (SQS) ─────────────────────────────────────────────────────────────────────────────────────────────────
resource "aws_cloudwatch_metric_alarm" "queue_depth" {
  for_each            = toset(var.queues)
  alarm_name          = "Cola ${each.key}: más de ${var.queue_depth_threshold} mensajes pendientes"
  alarm_description   = local.desc
  namespace           = "AWS/SQS"
  metric_name         = "ApproximateNumberOfMessagesVisible"
  statistic           = "Maximum"
  period              = 300
  evaluation_periods  = 3
  threshold           = var.queue_depth_threshold
  comparison_operator = "GreaterThanThreshold"
  dimensions          = { QueueName = each.key }
  alarm_actions       = local.topic
  tags                = var.context.labels
}

# ── Errores en los registros ────────────────────────────────────────────────────────────────────────────────────
resource "aws_cloudwatch_log_metric_filter" "app_errors" {
  count          = contains(local.opt_keys, "log_group_name") ? 1 : 0
  name           = "${var.context.prefix}-app-errores"
  log_group_name = local.log_group
  pattern        = "{ $.level >= 50 }"

  metric_transformation {
    name      = "${var.context.prefix}-app-errores"
    namespace = "Mirai"
    value     = "1"
  }
}

resource "aws_cloudwatch_metric_alarm" "app_errors" {
  count               = contains(local.opt_keys, "log_group_name") ? 1 : 0
  alarm_name          = "${var.context.prefix}: muchos errores en los registros"
  alarm_description   = local.desc
  namespace           = "Mirai"
  metric_name         = "${var.context.prefix}-app-errores"
  statistic           = "Sum"
  period              = 300
  evaluation_periods  = 1
  threshold           = var.app_error_threshold
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"
  alarm_actions       = local.topic
  tags                = var.context.labels
}

# ── Disponibilidad (Route 53, métricas en us-east-1) ────────────────────────────────────────────────────────────
resource "aws_route53_health_check" "this" {
  for_each          = var.uptime_checks
  type              = "HTTPS"
  fqdn              = each.value.host
  resource_path     = each.value.path
  port              = 443
  enable_sni        = true
  request_interval  = 30
  failure_threshold = 3
  tags              = merge(var.context.labels, { Name = "${var.context.prefix}-${each.key}" })
}

resource "aws_sns_topic" "us_east_1" {
  count    = length(var.uptime_checks) > 0 ? 1 : 0
  provider = aws.us_east_1
  name     = "${var.context.prefix}-alertas-disponibilidad"
  tags     = var.context.labels
}

resource "aws_sns_topic_subscription" "us_east_1" {
  for_each  = length(var.uptime_checks) > 0 ? var.notification_emails : {}
  provider  = aws.us_east_1
  topic_arn = aws_sns_topic.us_east_1[0].arn
  protocol  = "email"
  endpoint  = each.value
}

resource "aws_cloudwatch_metric_alarm" "uptime" {
  for_each            = var.uptime_checks
  provider            = aws.us_east_1
  alarm_name          = "${var.context.prefix} ${each.key}: no responde"
  alarm_description   = local.desc
  namespace           = "AWS/Route53"
  metric_name         = "HealthCheckStatus"
  statistic           = "Minimum"
  period              = 60
  evaluation_periods  = 2
  threshold           = 1
  comparison_operator = "LessThanThreshold"
  dimensions          = { HealthCheckId = aws_route53_health_check.this[each.key].id }
  alarm_actions       = [aws_sns_topic.us_east_1[0].arn]
  tags                = var.context.labels
}
