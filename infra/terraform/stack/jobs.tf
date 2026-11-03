# Cron (Cloud Scheduler) y colas (Cloud Tasks). Reemplazan apps/web/vercel.json (crons) y el job `mirai-notify`
# de pg_cron + pg_net. Mientras la base sea compartida, pruebas debe tener el cron en pausa (stages.scheduler_paused).

module "tasks" {
  source                     = "../modules/tasks"
  project_id                 = var.project_id
  region                     = var.region
  prefix                     = local.prefix
  oidc_service_account_email = module.iam.emails["tasks"]
  oidc_audience              = local.run_url.api
  enqueuers                  = { api = module.iam.members["api"] }

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
      description = "Avisos: latido, resúmenes a la hora de cada persona y fan-out por hogar en Cloud Tasks (reemplaza mirai-notify y el cron diario)."
    }
    automations-drain = {
      schedule    = "*/5 * * * *"
      path        = "/v1/jobs/automations/drain"
      description = "Procesa lo que quede en automation_events (escrituras fuera de la API)."
      retry_count = 1
    }
    refs-refresh = {
      schedule    = "0 6 * * *"
      path        = "/v1/jobs/refs/refresh"
      description = "TRM, usura y festivos (datos de referencia)."
    }
    calendar-sync = {
      schedule         = "20 6 * * *"
      path             = "/v1/jobs/calendar/sync"
      description      = "Google Calendar de quien lo conectó (encola por persona en la cola slow)."
      deadline_seconds = 300
    }
    plan-reminders = {
      schedule    = "0 9 * * *"
      path        = "/v1/jobs/plan/reminders"
      description = "Vencimientos de Premium y correos del plan."
    }
    net-worth-monthly = {
      schedule    = "30 6 1 * *"
      path        = "/v1/jobs/net-worth/monthly"
      description = "Foto del patrimonio del mes para los libros que no la tengan."
    }
  }
}
