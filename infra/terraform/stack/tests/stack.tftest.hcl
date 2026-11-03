# Pruebas del stack sin nube: `cd infra/terraform/stack && terraform init -backend=false && terraform test`.
# Los proveedores son simulados (mock_provider): se revisan expresiones, claves de for_each, validaciones y
# lo que se crea en cada etapa, sin credenciales ni costos.

mock_provider "google" {
  mock_data "google_project" {
    defaults = {
      number = "123456789012"
    }
  }
}

mock_provider "google" {
  alias = "cicd"
}

variables {
  environment     = "pruebas"
  project_id      = "engynex-mirai-pruebas"
  cicd_project_id = "engynex-mirai-cicd"
  region          = "us-west1"
  bucket_suffix   = "engynex"
  domains = {
    web                       = "pruebas.mirai.engynex.com"
    api                       = "api.pruebas.mirai.engynex.com"
    realtime                  = "rt.pruebas.mirai.engynex.com"
    files                     = "files.pruebas.mirai.engynex.com"
    canary_web                = "canary.pruebas.mirai.engynex.com"
    canary_api                = "canary-api.pruebas.mirai.engynex.com"
    certificate               = ["pruebas.mirai.engynex.com", "*.pruebas.mirai.engynex.com"]
    dns_authorization_domains = ["pruebas.mirai.engynex.com"]
  }
  public_config = {
    NEXT_PUBLIC_SUPABASE_URL             = "https://ejemplo.supabase.co"
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_prueba"
    GOOGLE_CLIENT_ID                     = "cliente.apps.googleusercontent.com"
    VAPID_SUBJECT                        = "mailto:soporte@engynex.com"
  }
  alert_emails = { dueno = "alertas@engynex.com" }
  cicd = {
    artifact_registry_path = "us-west1-docker.pkg.dev/engynex-mirai-cicd/mirai"
    artifact_registry_repo = "mirai"
    repository_id          = "projects/engynex-mirai-cicd/locations/us-west1/connections/github/repositories/mirai"
    branch_regex           = "^pruebas$"
  }
}

run "etapa_1" {
  command = plan

  variables {
    optional_secrets = ["google-client-secret"]
  }

  assert {
    condition     = length(module.cloud_sql) == 0 && length(module.redis) == 0 && length(module.realtime) == 0
    error_message = "En la etapa 1 no debe haber Cloud SQL, Redis ni realtime."
  }

  assert {
    condition     = local.run_url.api == "https://mirai-pruebas-api-123456789012.us-west1.run.app"
    error_message = "La URL determinista de la API no coincide."
  }

  assert {
    condition     = contains(keys(local.mounted_secrets["web"]), "ENCRYPTION_KEY") && contains(keys(local.mounted_secrets["web"]), "GOOGLE_CLIENT_SECRET") && !contains(keys(local.mounted_secrets["web"]), "VAPID_PRIVATE_KEY")
    error_message = "La web debe montar los secretos obligatorios y solo los opcionales habilitados."
  }

  assert {
    condition     = !contains(keys(local.mounted_secrets["web"]), "SUPABASE_DB_URL") && !contains(keys(local.mounted_secrets["api"]), "SUPABASE_DB_URL")
    error_message = "Ningún servicio debe montar SUPABASE_DB_URL."
  }

  assert {
    condition     = length(local.host_rules) == 5 && local.host_rules["files.pruebas.mirai.engynex.com"] == "files"
    error_message = "Se esperaban web, api, dos canarios y files en el balanceador."
  }

  assert {
    condition     = strcontains(base64decode(local.web_build_env_b64), "NEXT_PUBLIC_API_URL=https://api.pruebas.mirai.engynex.com") && !strcontains(base64decode(local.web_build_env_b64), "GOOGLE_CLIENT_ID")
    error_message = "El build de la web solo recibe NEXT_PUBLIC_* (y MIRAI_CSP_ENFORCE)."
  }

  assert {
    condition     = local.artifact_registry_location == "us-west1"
    error_message = "No se dedujo la región de Artifact Registry."
  }

  assert {
    condition     = length(module.triggers[0].trigger_names) == 2
    error_message = "Sin realtime solo hay disparadores de web y api."
  }

  # Nombres reales del núcleo de la API (apps/api/src/core/config/config.schema.ts) y de F2-E/F2-I.
  assert {
    condition = alltrue([
      local.api_env["MODE"] == "api",
      local.api_env["QUEUE_DRIVER"] == "cloudtasks",
      local.api_env["GCP_PROJECT"] == "engynex-mirai-pruebas",
      local.api_env["GCP_LOCATION"] == "us-west1",
      local.api_env["API_BASE_URL"] == local.run_url.api,
      local.api_env["SCHEDULER_AUDIENCE"] == local.run_url.api,
      local.api_env["API_PUBLIC_URL"] == "https://api.pruebas.mirai.engynex.com",
      local.api_env["SITE_URL"] == "https://pruebas.mirai.engynex.com",
      local.api_env["SUPABASE_URL"] == "https://ejemplo.supabase.co",
      local.api_env["TICK_DAILY_TASKS"] == "1",
      local.api_env["GIT_BRANCH"] == "pruebas",
      contains(keys(local.api_env), "TASKS_SERVICE_ACCOUNT"),
      contains(keys(local.api_env), "SCHEDULER_SERVICE_ACCOUNTS"),
    ])
    error_message = "La API debe recibir las variables con los nombres de su esquema zod."
  }

  assert {
    condition = length(setintersection(keys(local.api_env), [
      "GCP_PROJECT_ID", "GCP_REGION", "JOBS_OIDC_AUDIENCE", "JOBS_INVOKER_EMAILS", "TASKS_LOCATION", "TASKS_INVOKER_SA",
      "TASKS_TARGET_BASE_URL", "TASKS_QUEUE_NOTIFY", "TASKS_QUEUE_AUTOMATIONS", "TASKS_QUEUE_SLOW", "REDIS_HOST", "REDIS_AUTH",
    ])) == 0
    error_message = "No deben quedar los nombres viejos que la API no lee."
  }

  assert {
    condition     = local.api_env["WEB_ORIGINS"] == "https://pruebas.mirai.engynex.com,https://canary.pruebas.mirai.engynex.com"
    error_message = "WEB_ORIGINS = web + canario (sin extra_web_origins)."
  }

  assert {
    condition     = !contains(keys(local.api_env), "VAPID_PUBLIC_KEY") && local.api_env["VAPID_SUBJECT"] == "mailto:soporte@engynex.com"
    error_message = "Los valores públicos vacíos no se mandan; los presentes sí."
  }

  assert {
    condition     = toset(keys(module.tasks.queue_names)) == toset(["automations", "notify", "slow"]) && module.tasks.queue_names["notify"] == "notify"
    error_message = "Las colas deben tener los ids literales que usa la API."
  }

  assert {
    condition     = toset(keys(local.scheduler_jobs)) == toset(["automations-drain", "notify-tick"])
    error_message = "Scheduler solo llama al tick y al drain (el tick encola las diarias)."
  }

  assert {
    condition     = local.scheduler_jobs["notify-tick"].schedule == "5 * * * *" && local.scheduler_jobs["automations-drain"].schedule == "*/5 * * * *"
    error_message = "Horarios del tick y del drain."
  }

  assert {
    condition     = strcontains(base64decode(local.web_build_env_b64), "NEXT_PUBLIC_LIVE_SOURCE=supabase") && !strcontains(base64decode(local.web_build_env_b64), "NEXT_PUBLIC_REALTIME_URL")
    error_message = "Sin realtime la web sigue con Supabase Realtime y sin NEXT_PUBLIC_REALTIME_URL."
  }

  assert {
    condition     = contains(keys(local.mounted_secrets["api"]), "CRON_SECRET") && !contains(keys(local.mounted_secrets["api"]), "UPSTASH_REDIS_REST_TOKEN")
    error_message = "La API monta CRON_SECRET (transición) y no los secretos que no lee."
  }
}

run "origenes_extra" {
  command = plan

  variables {
    extra_web_origins = ["https://engynex-mirai-pruebas.vercel.app"]
    api_env           = { IDEMPOTENCY_STORE = "supabase", TICK_DAILY_TASKS = "0" }
  }

  assert {
    condition     = endswith(local.api_env["WEB_ORIGINS"], ",https://engynex-mirai-pruebas.vercel.app")
    error_message = "extra_web_origins se suma a WEB_ORIGINS."
  }

  assert {
    condition     = local.api_env["IDEMPOTENCY_STORE"] == "supabase" && local.api_env["TICK_DAILY_TASKS"] == "0"
    error_message = "api_env pisa las variables del stack."
  }
}

run "etapas_3_y_4" {
  command = plan

  variables {
    environment = "produccion"
    stages = {
      cloud_sql         = true
      redis             = true
      realtime          = true
      identity_platform = true
      scheduler_paused  = false
      uptime_checks     = true
    }
    cloud_sql = {
      tier              = "db-custom-2-7680"
      high_availability = true
    }
    identity_platform = {
      google_client_id = "cliente.apps.googleusercontent.com"
    }
  }

  assert {
    condition     = length(module.cloud_sql) == 1 && length(module.redis) == 1 && length(module.realtime) == 1 && length(module.identity_platform) == 1
    error_message = "Las etapas 3 y 4 deben crear Cloud SQL, Redis, realtime e Identity Platform."
  }

  assert {
    condition     = contains(keys(local.mounted_secrets["realtime"]), "REDIS_URL") && contains(keys(local.mounted_secrets["api"]), "REDIS_URL") && !contains(keys(local.mounted_secrets["web"]), "REDIS_URL")
    error_message = "REDIS_URL (Secret Manager) se monta en api y realtime, no en la web."
  }

  assert {
    condition     = local.api_env["REALTIME_API_EMIT"] == "1"
    error_message = "Con Redis la API publica los cambios para el gateway."
  }

  # Gateway: MODE=realtime, sin cron ni colas (el esquema ya no las exige en ese modo), con lo que pide el núcleo.
  assert {
    condition = alltrue([
      local.realtime_env["MODE"] == "realtime",
      local.realtime_env["MIRAI_ENV"] == "produccion",
      local.realtime_env["WEB_ORIGINS"] == local.api_env["WEB_ORIGINS"],
      length(setintersection(keys(local.realtime_env), ["SCHEDULER_AUDIENCE", "QUEUE_DRIVER", "API_BASE_URL", "TICK_DAILY_TASKS"])) == 0,
      contains(keys(local.mounted_secrets["realtime"]), "SUPABASE_SECRET_KEY"),
      contains(keys(local.mounted_secrets["realtime"]), "ENCRYPTION_KEY"),
      !contains(keys(local.mounted_secrets["realtime"]), "CRON_SECRET"),
    ])
    error_message = "El gateway recibe solo lo suyo."
  }

  assert {
    condition     = strcontains(base64decode(local.web_build_env_b64), "NEXT_PUBLIC_REALTIME_URL=https://rt.pruebas.mirai.engynex.com")
    error_message = "Con realtime, el build de la web recibe NEXT_PUBLIC_REALTIME_URL (rt.)."
  }

  assert {
    condition     = local.host_rules["rt.pruebas.mirai.engynex.com"] == "realtime"
    error_message = "El dominio rt. apunta al backend realtime."
  }

  assert {
    condition     = local.api_env["MODE"] == "api" && local.api_env["DB_ADAPTER"] == "supabase"
    error_message = "El adaptador sigue en supabase hasta el corte (db_adapter)."
  }

  assert {
    condition     = length(module.triggers[0].trigger_names) == 3
    error_message = "Con realtime hay tres disparadores."
  }

  assert {
    condition     = length(google_cloud_run_v2_job.migrate) == 1
    error_message = "Con Cloud SQL existe el trabajo de migraciones."
  }
}

run "realtime_sin_redis_falla" {
  command = plan

  variables {
    stages = {
      realtime = true
      redis    = false
    }
    services = {
      realtime = { max_instances = 3 }
    }
  }

  expect_failures = [var.stages]
}

run "realtime_una_instancia_sin_redis" {
  command = plan

  variables {
    stages = {
      realtime = true
      redis    = false
    }
    services = {
      realtime = { max_instances = 1, min_instances = 0 }
    }
  }

  assert {
    condition     = length(module.realtime) == 1 && length(module.redis) == 0 && !contains(keys(local.mounted_secrets["realtime"]), "REDIS_URL")
    error_message = "realtime de una instancia funciona sin Redis."
  }
}

run "secreto_en_public_config_falla" {
  command = plan

  variables {
    public_config = {
      NEXT_PUBLIC_SUPABASE_URL             = "https://ejemplo.supabase.co"
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_prueba"
      WOMPI_EVENTS_SECRET                  = "no-va-aqui"
    }
  }

  expect_failures = [var.public_config]
}

run "gateway_sin_realtime_falla" {
  command = plan

  variables {
    live_source = "gateway"
  }

  expect_failures = [var.live_source]
}

run "gateway_con_realtime" {
  command = plan

  variables {
    live_source = "gateway"
    stages = {
      realtime = true
    }
    services = {
      realtime = { max_instances = 1 }
    }
  }

  assert {
    condition     = strcontains(base64decode(local.web_build_env_b64), "NEXT_PUBLIC_LIVE_SOURCE=gateway")
    error_message = "live_source = gateway llega al build de la web."
  }
}

run "pg_sin_database_url_falla" {
  command = plan

  variables {
    db_adapter = "pg"
  }

  expect_failures = [var.db_adapter]
}

run "pg_con_database_url" {
  command = plan

  variables {
    db_adapter       = "pg"
    optional_secrets = ["database-url"]
    stages = {
      cloud_sql = true
    }
  }

  assert {
    condition     = local.api_env["DB_ADAPTER"] == "pg" && contains(keys(local.mounted_secrets["api"]), "DATABASE_URL")
    error_message = "Con db_adapter = pg la API monta DATABASE_URL."
  }
}
