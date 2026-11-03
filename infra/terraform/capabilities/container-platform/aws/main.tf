# container-platform/aws: clúster ECS (Fargate), espacio de nombres de Service Connect (Cloud Map HTTP) para que los
# servicios se llamen por nombre dentro de la VPC, y un ALB INTERNO (subredes privadas). El borde público es CloudFront
# con un "VPC origin" hacia este ALB (capabilities/edge/aws): el ALB no tiene IP pública.
#
# cloud_options:
#   container_insights (string, "enabled") = enabled | enhanced | disabled.
#   alb_idle_timeout_s (number, 3600)      = WebSocket del gateway (socket.io reconecta solo).

locals {
  opts      = var.cloud_options
  namespace = "${var.context.prefix}.interno"
}

resource "aws_ecs_cluster" "this" {
  name = var.context.prefix
  tags = var.context.labels

  setting {
    name  = "containerInsights"
    value = try(local.opts.container_insights, "enabled")
  }

  service_connect_defaults {
    namespace = aws_service_discovery_http_namespace.this.arn
  }
}

resource "aws_ecs_cluster_capacity_providers" "this" {
  cluster_name       = aws_ecs_cluster.this.name
  capacity_providers = ["FARGATE", "FARGATE_SPOT"]

  default_capacity_provider_strategy {
    capacity_provider = "FARGATE"
    weight            = 1
  }
}

resource "aws_service_discovery_http_namespace" "this" {
  name        = local.namespace
  description = "Service Connect de ${var.context.prefix} (web → api, api → postgrest)."
  tags        = var.context.labels
}

resource "aws_cloudwatch_log_group" "this" {
  name              = "/ecs/${var.context.prefix}"
  retention_in_days = var.log_retention_days
  tags              = var.context.labels
}

# ── Grupos de seguridad ─────────────────────────────────────────────────────────────────────────────────────────
# ALB: HTTP solo desde la VPC (las interfaces del VPC origin de CloudFront y el cron viven en las subredes).
resource "aws_security_group" "alb" {
  name        = "${var.context.prefix}-alb"
  description = "ALB interno de ${var.context.prefix}: HTTP desde la VPC."
  vpc_id      = var.network.vpc_id
  tags        = merge(var.context.labels, { Name = "${var.context.prefix}-alb" })
}

resource "aws_vpc_security_group_ingress_rule" "alb_http" {
  security_group_id = aws_security_group.alb.id
  description       = "HTTP desde la VPC (VPC origin de CloudFront y cron)."
  cidr_ipv4         = var.network.cidr
  ip_protocol       = "tcp"
  from_port         = 80
  to_port           = 80
}

resource "aws_vpc_security_group_egress_rule" "alb_all" {
  security_group_id = aws_security_group.alb.id
  description       = "Hacia las tareas."
  cidr_ipv4         = var.network.cidr
  ip_protocol       = "-1"
}

# Tareas: entrada desde el ALB y entre ellas (Service Connect); salida a internet por el NAT.
resource "aws_security_group" "tasks" {
  name        = "${var.context.prefix}-tareas"
  description = "Tareas de ECS de ${var.context.prefix}."
  vpc_id      = var.network.vpc_id
  tags        = merge(var.context.labels, { Name = "${var.context.prefix}-tareas" })
}

resource "aws_vpc_security_group_ingress_rule" "tasks_from_alb" {
  security_group_id            = aws_security_group.tasks.id
  description                  = "Desde el ALB interno."
  referenced_security_group_id = aws_security_group.alb.id
  ip_protocol                  = "tcp"
  from_port                    = 1024
  to_port                      = 65535
}

resource "aws_vpc_security_group_ingress_rule" "tasks_self" {
  security_group_id            = aws_security_group.tasks.id
  description                  = "Entre servicios (Service Connect)."
  referenced_security_group_id = aws_security_group.tasks.id
  ip_protocol                  = "-1"
}

resource "aws_vpc_security_group_egress_rule" "tasks_all" {
  security_group_id = aws_security_group.tasks.id
  description       = "Salida (base, Redis, APIs externas por el NAT)."
  cidr_ipv4         = "0.0.0.0/0"
  ip_protocol       = "-1"
}

# ── ALB interno ─────────────────────────────────────────────────────────────────────────────────────────────────
resource "aws_lb" "this" {
  name                       = substr("${var.context.prefix}-alb", 0, 32)
  internal                   = true
  load_balancer_type         = "application"
  subnets                    = var.network.private_subnet_ids
  security_groups            = [aws_security_group.alb.id]
  idle_timeout               = try(local.opts.alb_idle_timeout_s, 3600)
  drop_invalid_header_fields = true
  enable_deletion_protection = var.context.environment == "produccion"
  tags                       = var.context.labels
}

# Por defecto 404: cada container-service agrega sus reglas (dominio + camino → su grupo de destino).
resource "aws_lb_listener" "http" {
  load_balancer_arn = aws_lb.this.arn
  port              = 80
  protocol          = "HTTP"

  default_action {
    type = "fixed-response"
    fixed_response {
      content_type = "text/plain"
      message_body = "No encontrado"
      status_code  = "404"
    }
  }

  tags = var.context.labels
}
