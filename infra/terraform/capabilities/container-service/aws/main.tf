# container-service/aws: servicio de ECS Fargate en las subredes privadas, con Service Connect (los demás servicios lo
# llaman por http://<name>.<espacio>:<port>) y, si tiene `routes`, un grupo de destino en el ALB interno con una regla
# por ruta (dominio + camino, `priority`). El borde (CloudFront) llega al ALB por un VPC origin.
#
# Imagen y despliegues: la imagen vive en el parámetro de SSM /<name>/image. Terraform lo crea con la imagen inicial y
# NO lo vuelve a escribir (ignore_changes); el CI/CD (infra/deploy/aws/desplegar.sh) lo actualiza con el digest
# aprobado y registra la revisión. Así un `terraform apply` posterior arma la definición de tarea con la imagen que está
# corriendo (no revierte un despliegue) y los cambios de variables sí se despliegan.
# Vuelta atrás automática: deployment circuit breaker + alarma de 5xx del grupo de destino en el bloque `alarms`.
#
# Traducción del contrato:
#   cpu/memory → valores válidos de Fargate (la memoria se ajusta al mínimo/máximo de esa CPU: 1 vCPU exige 2–8 GB).
#   min_instances 0 → 1 (Fargate no escala a cero con un ALB delante) salvo cloud_options.allow_zero = true.
#   always_on_cpu, timeout_s, invokers, deletion_protection: Fargate siempre tiene CPU; el tiempo máximo lo pone el ALB
#     (idle_timeout de container-platform); el acceso es por red; ECS no tiene protección de borrado (ver RDS y S3).
#   probes: el chequeo es el del grupo de destino (health_path); los servicios internos no tienen sonda HTTP.
#   ingress public: igual que edge (en AWS no hay servicio público sin borde).
#
# cloud_options:
#   allow_zero (bool, false), spot (bool, false: FARGATE_SPOT), cpu_architecture (X86_64 | ARM64),
#   cpu_target (number, 60), requests_per_target (number, concurrency × 30 por minuto),
#   max_5xx_per_minute (number, 10: umbral de la alarma de vuelta atrás), health_matcher (string, "200-399"),
#   deregistration_delay_s (number, 30),
#   otel_collector ({ image, config }): colector OpenTelemetry como sidecar no esencial (config = YAML de
#     infra/otel/collector.aws.yaml en OTELCOL_CONFIG, --config=env:OTELCOL_CONFIG; env = variables extra); la app
#     arranca después.

locals {
  opts = var.cloud_options
  p    = var.platform

  cpu_units = { "0.25" = 256, "0.5" = 512, "1" = 1024, "2" = 2048, "4" = 4096 }[var.cpu]
  mem_min   = { 256 = 512, 512 = 1024, 1024 = 2048, 2048 = 4096, 4096 = 8192 }[local.cpu_units]
  mem_max   = { 256 = 2048, 512 = 4096, 1024 = 8192, 2048 = 16384, 4096 = 30720 }[local.cpu_units]
  mem_req   = endswith(var.memory, "Gi") ? tonumber(trimsuffix(var.memory, "Gi")) * 1024 : tonumber(trimsuffix(var.memory, "Mi"))
  mem_c     = max(local.mem_min, min(local.mem_max, local.mem_req))
  memory    = local.mem_c <= 512 ? 512 : ceil(local.mem_c / 1024) * 1024

  min = var.min_instances == 0 && !try(local.opts.allow_zero, false) ? 1 : var.min_instances
  max = max(var.max_instances, local.min)

  has_lb    = length(var.routes) > 0
  dns_name  = "${var.name}.${local.p.namespace_name}"
  image     = coalesce(var.image, "public.ecr.aws/nginx/nginx:stable")
  tg_name   = substr(var.name, 0, 32)
  container = "app"

  container_definition = merge(
    {
      name      = local.container
      image     = aws_ssm_parameter.image.insecure_value
      essential = true
      portMappings = [{
        name          = "http"
        containerPort = var.port
        protocol      = "tcp"
        appProtocol   = "http"
      }]
      environment = [for k in sort(keys(merge(var.env, { PORT = tostring(var.port) }))) : { name = k, value = merge(var.env, { PORT = tostring(var.port) })[k] }]
      secrets     = [for k in sort(keys(var.secret_env)) : { name = k, valueFrom = var.secret_env[k] }]
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          awslogs-group         = local.p.log_group_name
          awslogs-region        = local.p.region
          awslogs-stream-prefix = var.name
        }
      }
      stopTimeout = 30
    },
    var.command == null ? {} : { entryPoint = var.command },
    var.args == null ? {} : { command = var.args },
    local.otel == null ? {} : { dependsOn = [{ containerName = "otel", condition = "START" }] },
  )

  otel = try(local.opts.otel_collector, null)
  otel_definition = local.otel == null ? [] : [{
    name        = "otel"
    image       = local.otel.image
    essential   = false
    command     = ["--config=env:OTELCOL_CONFIG"]
    environment = [for k, v in merge(try(local.otel.env, {}), { OTELCOL_CONFIG = local.otel.config }) : { name = k, value = v }]
    logConfiguration = {
      logDriver = "awslogs"
      options = {
        awslogs-group         = local.p.log_group_name
        awslogs-region        = local.p.region
        awslogs-stream-prefix = "${var.name}-otel"
      }
    }
  }]
}

# Imagen desplegada (la escribe el CI/CD).
resource "aws_ssm_parameter" "image" {
  name           = "/${var.name}/image"
  description    = "Imagen desplegada de ${var.name} (la actualiza infra/deploy/aws/desplegar.sh)."
  type           = "String"
  insecure_value = local.image
  tags           = var.context.labels

  lifecycle {
    ignore_changes = [insecure_value]
  }
}

resource "aws_ecs_task_definition" "this" {
  family                   = var.name
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = tostring(local.cpu_units)
  memory                   = tostring(local.memory)
  execution_role_arn       = var.identity.arn
  task_role_arn            = var.identity.arn
  track_latest             = true
  container_definitions    = jsonencode(concat([local.container_definition], local.otel_definition))

  runtime_platform {
    operating_system_family = "LINUX"
    cpu_architecture        = try(local.opts.cpu_architecture, "X86_64")
  }

  tags = merge(var.context.labels, { servicio = var.name })
}

# ── Borde: grupo de destino y reglas en el ALB interno ──────────────────────────────────────────────────────────
resource "aws_lb_target_group" "this" {
  count                = local.has_lb ? 1 : 0
  name                 = local.tg_name
  port                 = var.port
  protocol             = "HTTP"
  target_type          = "ip"
  vpc_id               = local.p.vpc_id
  deregistration_delay = try(local.opts.deregistration_delay_s, 30)

  health_check {
    enabled             = true
    path                = coalesce(var.health_path, "/")
    matcher             = try(local.opts.health_matcher, "200-399")
    interval            = 15
    timeout             = 5
    healthy_threshold   = 2
    unhealthy_threshold = 3
  }

  stickiness {
    type            = "lb_cookie"
    enabled         = var.session_affinity
    cookie_duration = 86400
  }

  tags = merge(var.context.labels, { servicio = var.name })
}

resource "aws_lb_listener_rule" "this" {
  for_each     = { for r in var.routes : tostring(r.priority) => r }
  listener_arn = local.p.listener_arn
  priority     = each.value.priority

  action {
    type             = "forward"
    target_group_arn = aws_lb_target_group.this[0].arn
  }

  condition {
    host_header {
      values = each.value.hosts
    }
  }

  condition {
    path_pattern {
      values = each.value.paths
    }
  }

  tags = var.context.labels
}

resource "aws_cloudwatch_metric_alarm" "rollback_5xx" {
  count               = local.has_lb ? 1 : 0
  alarm_name          = "${var.name}-5xx-despliegue"
  alarm_description   = "Errores 5xx de ${var.name}: ECS revierte el despliegue en curso si se dispara."
  namespace           = "AWS/ApplicationELB"
  metric_name         = "HTTPCode_Target_5XX_Count"
  statistic           = "Sum"
  period              = 60
  evaluation_periods  = 3
  datapoints_to_alarm = 2
  threshold           = try(local.opts.max_5xx_per_minute, 10)
  comparison_operator = "GreaterThanThreshold"
  treat_missing_data  = "notBreaching"
  dimensions = {
    TargetGroup  = aws_lb_target_group.this[0].arn_suffix
    LoadBalancer = local.p.alb_arn_suffix
  }
  tags = var.context.labels
}

# ── Servicio ────────────────────────────────────────────────────────────────────────────────────────────────────
resource "aws_ecs_service" "this" {
  name                               = var.name
  cluster                            = local.p.cluster_arn
  task_definition                    = aws_ecs_task_definition.this.arn
  desired_count                      = local.min
  deployment_minimum_healthy_percent = 100
  deployment_maximum_percent         = 200
  health_check_grace_period_seconds  = local.has_lb ? 60 : null
  enable_execute_command             = false
  propagate_tags                     = "SERVICE"
  wait_for_steady_state              = false

  capacity_provider_strategy {
    capacity_provider = try(local.opts.spot, false) ? "FARGATE_SPOT" : "FARGATE"
    weight            = 1
  }

  network_configuration {
    subnets          = local.p.private_subnet_ids
    security_groups  = [local.p.tasks_sg_id]
    assign_public_ip = false
  }

  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }

  dynamic "alarms" {
    for_each = local.has_lb ? [1] : []
    content {
      alarm_names = [aws_cloudwatch_metric_alarm.rollback_5xx[0].alarm_name]
      enable      = true
      rollback    = true
    }
  }

  dynamic "load_balancer" {
    for_each = local.has_lb ? [1] : []
    content {
      target_group_arn = aws_lb_target_group.this[0].arn
      container_name   = local.container
      container_port   = var.port
    }
  }

  service_connect_configuration {
    enabled   = true
    namespace = local.p.namespace_arn

    service {
      port_name      = "http"
      discovery_name = var.name
      client_alias {
        port     = var.port
        dns_name = local.dns_name
      }
    }
  }

  tags = merge(var.context.labels, { servicio = var.name })

  # desired_count lo maneja el autoescalado.
  lifecycle {
    ignore_changes = [desired_count]
  }

  depends_on = [aws_lb_listener_rule.this]
}

# ── Autoescalado ────────────────────────────────────────────────────────────────────────────────────────────────
resource "aws_appautoscaling_target" "this" {
  service_namespace  = "ecs"
  scalable_dimension = "ecs:service:DesiredCount"
  resource_id        = "service/${local.p.cluster_name}/${aws_ecs_service.this.name}"
  min_capacity       = local.min
  max_capacity       = local.max
}

resource "aws_appautoscaling_policy" "cpu" {
  name               = "${var.name}-cpu"
  policy_type        = "TargetTrackingScaling"
  service_namespace  = aws_appautoscaling_target.this.service_namespace
  scalable_dimension = aws_appautoscaling_target.this.scalable_dimension
  resource_id        = aws_appautoscaling_target.this.resource_id

  target_tracking_scaling_policy_configuration {
    target_value       = try(local.opts.cpu_target, 60)
    scale_in_cooldown  = 300
    scale_out_cooldown = 60
    predefined_metric_specification {
      predefined_metric_type = "ECSServiceAverageCPUUtilization"
    }
  }
}

# Peticiones por destino (equivalente aproximado a la concurrencia de Cloud Run: concurrency × 30 por minuto).
resource "aws_appautoscaling_policy" "requests" {
  count              = local.has_lb ? 1 : 0
  name               = "${var.name}-peticiones"
  policy_type        = "TargetTrackingScaling"
  service_namespace  = aws_appautoscaling_target.this.service_namespace
  scalable_dimension = aws_appautoscaling_target.this.scalable_dimension
  resource_id        = aws_appautoscaling_target.this.resource_id

  target_tracking_scaling_policy_configuration {
    target_value       = try(local.opts.requests_per_target, var.concurrency * 30)
    scale_in_cooldown  = 300
    scale_out_cooldown = 60
    predefined_metric_specification {
      predefined_metric_type = "ALBRequestCountPerTarget"
      resource_label         = "${local.p.alb_arn_suffix}/${aws_lb_target_group.this[0].arn_suffix}"
    }
  }
}
