# Cron (EventBridge Scheduler → curl con Bearer CRON_SECRET al ALB interno), colas (SQS + DLQ, o Postgres) y el
# trabajo de migraciones (definición de tarea que el CI corre con infra/deploy/aws/migrar.sh).
# Reparto igual que en GCP (apps/api/src/modules/jobs/jobs.service.ts): el tick horario encola por hogar y las diarias
# (TICK_DAILY_TASKS=1); el drain cada 5 min procesa automation_events.

module "queue" {
  source    = "../../../capabilities/queue/aws"
  context   = local.context
  enabled   = var.aws.queue_enabled
  target    = { url = local.internal.api }
  enqueuers = { api = module.identity.principals["api"], worker = module.identity.principals["worker"] }
  consumers = { worker = module.identity.principals["worker"] }

  queues = {
    notify      = { max_per_second = 20, max_concurrent = 20, max_attempts = 5, max_retry_s = 3000 }
    automations = { max_per_second = 10, max_concurrent = 10, max_attempts = 5 }
    slow        = { max_per_second = 2, max_concurrent = 4, max_attempts = 3, min_backoff_s = 60, max_backoff_s = 1800, max_retry_s = 21600 }
  }
}

locals {
  scheduler_jobs = {
    notify-tick = {
      schedule    = "5 * * * *"
      path        = "/v1/jobs/notify/tick"
      description = "Avisos: latido, encolado por hogar y tareas diarias de las 6 y las 9."
    }
    automations-drain = {
      schedule    = "*/5 * * * *"
      path        = "/v1/jobs/automations/drain"
      description = "Procesa lo que quede en automation_events (escrituras fuera de la API)."
      retry_count = 1
    }
  }
}

module "scheduler" {
  source     = "../../../capabilities/scheduler/aws"
  context    = local.context
  platform   = module.platform.platform
  identity   = module.identity.handles["scheduler"]
  secret_ref = module.secrets.refs["cron-secret"]
  paused     = var.features.scheduler_paused
  jobs       = { for k, j in local.scheduler_jobs : k => merge(j, { body = jsonencode({ dry = var.scheduler_dry_run }) }) }

  # Por el ALB interno con el Host de la API (la regla de dominio la manda al servicio api).
  target = {
    base_url    = "http://${module.platform.platform.alb_dns_name}"
    host_header = var.domains.api
  }
}

# ── db-migrate ──────────────────────────────────────────────────────────────────────────────────────────────────
resource "aws_ssm_parameter" "migrate_image" {
  count          = var.features.postgres ? 1 : 0
  name           = "/${local.names.migrate}/image"
  description    = "Imagen del trabajo de migraciones (la de la API; la actualiza infra/deploy/aws/migrar.sh)."
  type           = "String"
  insecure_value = coalesce(var.images.api, "public.ecr.aws/nginx/nginx:stable")
  tags           = local.labels

  lifecycle {
    ignore_changes = [insecure_value]
  }
}

resource "aws_ecs_task_definition" "migrate" {
  count                    = var.features.postgres ? 1 : 0
  family                   = local.names.migrate
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = "512"
  memory                   = "1024"
  execution_role_arn       = module.identity.handles["migrator"].arn
  task_role_arn            = module.identity.handles["migrator"].arn
  track_latest             = true

  container_definitions = jsonencode([{
    name        = "migrate"
    image       = aws_ssm_parameter.migrate_image[0].insecure_value
    essential   = true
    entryPoint  = var.migrate_job.command
    command     = var.migrate_job.args
    environment = [for k in sort(keys(module.app.env.migrate)) : { name = k, value = module.app.env.migrate[k] }]
    secrets     = [for k in sort(keys(local.secret_env["migrate"])) : { name = k, valueFrom = local.secret_env["migrate"][k] }]
    logConfiguration = {
      logDriver = "awslogs"
      options = {
        awslogs-group         = module.platform.platform.log_group_name
        awslogs-region        = var.region
        awslogs-stream-prefix = "db-migrate"
      }
    }
  }])

  runtime_platform {
    operating_system_family = "LINUX"
    cpu_architecture        = var.aws.cpu_architecture
  }

  tags = merge(local.labels, { servicio = "db-migrate" })
}
