# Cron (Cloud Scheduler) y colas (Cloud Tasks). Reemplazan apps/web/vercel.json (crons) y el job `mirai-notify`
# de pg_cron + pg_net. Mientras la base sea compartida, pruebas debe tener el cron en pausa (stages.scheduler_paused).
#
# Reparto (apps/api/src/modules/jobs/jobs.service.ts):
# - notify/tick (cada hora, :05) hace el latido y encola: notify/household/<h> por hogar, plan/emails y
#   automations/hourly; a las 6 a. m. refs/refresh, calendar/sync y net-worth/monthly, y a las 9 plan/reminders
#   (TICK_DAILY_TASKS=1 en services.tf). Por eso esas diarias NO tienen trabajo propio aquí: se enviarían dos veces.
# - automations/drain (cada 5 min) no lo encola el tick: procesa lo que dejaron en automation_events las escrituras
#   que no pasan por la API.
# Si algún día se prefiere un trabajo por tarea diaria: TICK_DAILY_TASKS=0 en var.api_env y se agregan aquí.

module "tasks" {
  source                     = "../modules/tasks"
  project_id                 = var.project_id
  region                     = var.region
  oidc_service_account_email = module.iam.emails["tasks"]
  oidc_audience              = local.run_url.api
  enqueuers                  = { api = module.iam.members["api"] }

  # Ids literales: los de QueueName en apps/api/src/core/queue/queue.port.ts (el proyecto ya aísla cada ambiente).
  queues = {
    notify = {
      max_dispatches_per_second = 20
      max_concurrent_dispatches = 20
      max_attempts              = 5
      max_retry_duration        = "3000s" # antes del siguiente tick horario
    }
    automations = {
      max_dispatches_per_second = 10
      max_concurrent_dispatches = 10
      max_attempts              = 5
    }
    slow = {
      max_dispatches_per_second = 2
      max_concurrent_dispatches = 4
      max_attempts              = 3
      min_backoff               = "60s"
      max_backoff               = "1800s"
      max_retry_duration        = "21600s"
    }
  }
}

module "scheduler" {
  source                = "../modules/scheduler"
  project_id            = var.project_id
  region                = var.region
  prefix                = local.prefix
  target_base_url       = local.run_url.api
  audience              = local.run_url.api
  service_account_email = module.iam.emails["scheduler"]
  paused                = var.stages.scheduler_paused

  jobs = { for k, j in local.scheduler_jobs : k => merge(j, { body = jsonencode({ dry = var.scheduler_dry_run }) }) }
}

locals {
  scheduler_jobs = {
    notify-tick = {
      schedule    = "5 * * * *"
      path        = "/v1/jobs/notify/tick"
      description = "Avisos: latido, fan-out por hogar en Cloud Tasks y tareas diarias de las 6 y las 9 (reemplaza mirai-notify y el cron diario de Vercel)."
    }
    automations-drain = {
      schedule    = "*/5 * * * *"
      path        = "/v1/jobs/automations/drain"
      description = "Procesa lo que quede en automation_events (escrituras fuera de la API)."
      retry_count = 1
    }
  }
}
