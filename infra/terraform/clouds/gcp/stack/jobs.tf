# Cron (Cloud Scheduler) y colas (Cloud Tasks). Reemplazan apps/web/vercel.json (crons) y el job `mirai-notify`
# de pg_cron + pg_net. Mientras la base sea compartida con Supabase, pruebas debe tener el cron en pausa.
#
# Reparto (apps/api/src/modules/jobs/jobs.service.ts):
# - notify/tick (cada hora, :05) hace el latido y encola: notify/household/<h> por hogar, plan/emails y
#   automations/hourly; a las 6 a. m. refs/refresh, calendar/sync y net-worth/monthly, y a las 9 plan/reminders
#   (TICK_DAILY_TASKS=1). Por eso esas diarias NO tienen trabajo propio aquí: se enviarían dos veces.
# - automations/drain (cada 5 min) procesa lo que dejaron en automation_events las escrituras fuera de la API.
# Si algún día se prefiere un trabajo por tarea diaria: TICK_DAILY_TASKS=0 en var.api_env y se agregan aquí.

module "tasks" {
  source    = "../../../capabilities/queue/gcp"
  context   = local.context
  enabled   = true # GCP: Cloud Tasks empuja por HTTP (sin worker). false = QUEUE_DRIVER=http (la API se despacha sola)
  enqueuers = { api = module.iam.principals["api"] }

  target = {
    url      = local.run_url.api
    audience = local.run_url.api
    identity = module.iam.ids["tasks"]
  }

  # Ids literales: los de QueueName en apps/api/src/core/queue/queue.port.ts (el proyecto ya aísla cada ambiente).
  queues = {
    notify = {
      max_per_second = 20
      max_concurrent = 20
      max_attempts   = 5
      max_retry_s    = 3000 # antes del siguiente tick horario
    }
    automations = {
      max_per_second = 10
      max_concurrent = 10
      max_attempts   = 5
    }
    slow = {
      max_per_second = 2
      max_concurrent = 4
      max_attempts   = 3
      min_backoff_s  = 60
      max_backoff_s  = 1800
      max_retry_s    = 21600
    }
  }
}

module "scheduler" {
  source  = "../../../capabilities/scheduler/gcp"
  context = local.context
  paused  = var.features.scheduler_paused

  target = {
    base_url = local.run_url.api
    audience = local.run_url.api
    identity = module.iam.ids["scheduler"]
  }

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
