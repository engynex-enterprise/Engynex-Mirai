# scheduler/aws: EventBridge Scheduler (grupo por ambiente, zona horaria America/Bogota) lanza con el destino universal
# ecs:runTask una tarea mínima de curl que hace POST a <target.base_url><path> con Authorization: Bearer $CRON_SECRET
# (el secreto lo inyecta ECS desde Secrets Manager: secret_ref) y, si se da, el Host del ALB interno
# (target.host_header = dominio de la API, para que la regla del ALB lo mande a la API). La API lo valida en
# SchedulerGuard (Bearer CRON_SECRET). Una tarea por ejecución: no hay servidor de cron que mantener.
#
# Cron: el formato de 5 campos se traduce al de EventBridge (6 campos: el día de la semana va como ? si es *,
# */n pasa a 0/n). Si un trabajo usa día de la semana, escríbelo con la numeración de AWS (1 = domingo).
# cloud_options: curl_image (string, "docker.io/curlimages/curl:8.11.1").

locals {
  opts  = var.cloud_options
  p     = var.platform
  image = try(local.opts.curl_image, "docker.io/curlimages/curl:8.11.1")

  host_header = var.target.host_header == null ? "" : " -H \"Host: ${var.target.host_header}\""

  # 5 campos (min hora día mes semana) → cron(min hora día mes semana año) de EventBridge.
  expr = {
    for k, j in var.jobs : k => (
      length(split(" ", j.schedule)) != 5 ? j.schedule : format("cron(%s %s %s %s %s *)",
        replace(split(" ", j.schedule)[0], "*/", "0/"),
        replace(split(" ", j.schedule)[1], "*/", "0/"),
        split(" ", j.schedule)[4] == "*" ? split(" ", j.schedule)[2] : "?",
        split(" ", j.schedule)[3],
        split(" ", j.schedule)[4] == "*" ? "?" : split(" ", j.schedule)[4],
      )
    )
  }
}

resource "aws_scheduler_schedule_group" "this" {
  name = var.context.prefix
  tags = var.context.labels
}

resource "aws_ecs_task_definition" "curl" {
  family                   = "${var.context.prefix}-cron"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = "256"
  memory                   = "512"
  execution_role_arn       = var.identity.arn
  task_role_arn            = var.identity.arn

  container_definitions = jsonencode([merge(
    {
      name       = "curl"
      image      = local.image
      essential  = true
      entryPoint = ["/bin/sh", "-c"]
      command = [
        "curl -fsS --retry 2 --max-time \"$${DEADLINE:-180}\" -X POST -H \"Content-Type: application/json\" -H \"User-Agent: mirai-scheduler\" -H \"Authorization: Bearer $${CRON_SECRET}\"${local.host_header} --data \"$${BODY}\" \"$${URL}\""
      ]
      environment = [{ name = "URL", value = var.target.base_url }]
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          awslogs-group         = local.p.log_group_name
          awslogs-region        = local.p.region
          awslogs-stream-prefix = "cron"
        }
      }
    },
    var.secret_ref == null ? {} : { secrets = [{ name = "CRON_SECRET", valueFrom = var.secret_ref }] },
  )])

  tags = var.context.labels
}

# El rol del scheduler lanza la tarea y le pasa su propio rol (la tarea corre con la misma identidad).
resource "aws_iam_role_policy" "run_task" {
  name = "mirai-cron"
  role = var.identity.name
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect    = "Allow"
        Action    = ["ecs:RunTask"]
        Resource  = [aws_ecs_task_definition.curl.arn_without_revision, "${aws_ecs_task_definition.curl.arn_without_revision}:*"]
        Condition = { ArnEquals = { "ecs:cluster" = local.p.cluster_arn } }
      },
      { Effect = "Allow", Action = ["iam:PassRole"], Resource = var.identity.arn },
      { Effect = "Allow", Action = ["ecs:TagResource"], Resource = "*" },
    ]
  })
}

resource "aws_scheduler_schedule" "this" {
  for_each                     = var.jobs
  name                         = substr("${var.context.prefix}-${each.key}", 0, 64)
  group_name                   = aws_scheduler_schedule_group.this.name
  description                  = substr(each.value.description, 0, 512)
  schedule_expression          = local.expr[each.key]
  schedule_expression_timezone = var.time_zone
  state                        = var.paused || each.value.paused ? "DISABLED" : "ENABLED"

  flexible_time_window {
    mode = "OFF"
  }

  target {
    arn      = "arn:aws:scheduler:::aws-sdk:ecs:runTask"
    role_arn = var.identity.arn
    input = jsonencode({
      Cluster        = local.p.cluster_arn
      TaskDefinition = aws_ecs_task_definition.curl.arn_without_revision
      LaunchType     = "FARGATE"
      NetworkConfiguration = {
        AwsvpcConfiguration = {
          Subnets        = local.p.private_subnet_ids
          SecurityGroups = [local.p.tasks_sg_id]
          AssignPublicIp = "DISABLED"
        }
      }
      Overrides = {
        ContainerOverrides = [{
          Name = "curl"
          Environment = [
            { Name = "URL", Value = "${trimsuffix(var.target.base_url, "/")}${each.value.path}" },
            { Name = "BODY", Value = each.value.body },
            { Name = "DEADLINE", Value = tostring(each.value.deadline_s) },
          ]
        }]
      }
    })

    retry_policy {
      maximum_retry_attempts       = each.value.retry_count
      maximum_event_age_in_seconds = max(60, each.value.deadline_s * 2)
    }
  }
}
