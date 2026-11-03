# Pruebas del stack de GCP sin nube: `cd infra/terraform/clouds/gcp/stack && terraform init -backend=false && terraform test`.
# Proveedores simulados (mock_provider): se revisan expresiones, claves de for_each, validaciones y lo que se crea con
# cada bandera, sin credenciales ni costos. Son las pruebas de v6 (stack/tests) adaptadas a v7 (Cloud SQL principal,
# Better Auth, mismo origen, PostgREST, worker, us-east1) más las nuevas.

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

mock_provider "random" {}

variables {
  environment     = "pruebas"
  project_id      = "engynex-mirai-pruebas"
  cicd_project_id = "engynex-mirai-cicd"
  region          = "us-east1"
  bucket_suffix   = "engynex"
  network         = { cidr = "10.10.0.0/24" }
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
  features = {
    realtime = true
  }
  services = {
    realtime = { max_instances = 1 }
  }
  public_config = {
    GOOGLE_CLIENT_ID = "cliente.apps.googleusercontent.com"
    VAPID_SUBJECT    = "mailto:soporte@engynex.com"
  }
  alert_emails = { dueno = "alertas@engynex.com" }
  cicd = {
    artifact_registry_path = "us-east1-docker.pkg.dev/engynex-mirai-cicd/mirai"
    artifact_registry_repo = "mirai"
    repository_id          = "projects/engynex-mirai-cicd/locations/us-east1/connections/github/repositories/mirai"
    branch_regex           = "^pruebas$"
  }
}

run "v7_por_defecto" {
  command = plan

  variables {
    optional_secrets = ["google-client-secret"]
  }

  assert {
    condition     = length(module.cloud_sql) == 1 && length(module.realtime) == 1 && length(module.redis) == 0 && length(google_cloud_run_v2_job.migrate) == 1
    error_message = "v7: Cloud SQL es la base principal (con su trabajo de migraciones) y el gateway está encendido."
  }

  assert {
    condition     = local.run_url.api == "https://mirai-pruebas-api-123456789012.us-east1.run.app"
    error_message = "La URL determinista de la API no coincide."
  }

  assert {
    condition     = contains(keys(local.mounted_secrets["web"]), "ENCRYPTION_KEY") && contains(keys(local.mounted_secrets["web"]), "GOOGLE_CLIENT_SECRET") && !contains(keys(local.mounted_secrets["web"]), "VAPID_PRIVATE_KEY")
    error_message = "La web debe montar los secretos obligatorios y solo los opcionales habilitados."
  }

  assert {
    condition     = !contains(keys(local.mounted_secrets["web"]), "SUPABASE_SECRET_KEY") && !contains(keys(local.mounted_secrets["api"]), "SUPABASE_SECRET_KEY") && !contains(keys(local.api_env), "SUPABASE_URL")
    error_message = "Sin features.supabase no queda nada de Supabase."
  }

  assert {
    condition     = !contains(keys(local.mounted_secrets["web"]), "SUPABASE_DB_URL") && !contains(keys(local.mounted_secrets["api"]), "SUPABASE_DB_URL")
    error_message = "Ningún servicio debe montar SUPABASE_DB_URL."
  }

  assert {
    condition     = length(local.host_rules) == 6 && local.host_rules["files.pruebas.mirai.engynex.com"] == "files" && local.host_rules["rt.pruebas.mirai.engynex.com"] == "realtime"
    error_message = "Se esperaban web, api, realtime, files y dos canarios en el balanceador."
  }

  assert {
    condition     = strcontains(base64decode(local.web_build_env_b64), "NEXT_PUBLIC_API_URL=https://pruebas.mirai.engynex.com") && !strcontains(base64decode(local.web_build_env_b64), "GOOGLE_CLIENT_ID")
    error_message = "Mismo origen: el navegador llama a la API por el dominio de la web; el build solo recibe NEXT_PUBLIC_*."
  }

  assert {
    condition     = strcontains(base64decode(local.web_build_env_b64), "NEXT_PUBLIC_LIVE_SOURCE=gateway") && strcontains(base64decode(local.web_build_env_b64), "NEXT_PUBLIC_REALTIME_URL=https://pruebas.mirai.engynex.com")
    error_message = "v7: la web usa el gateway por el mismo origen."
  }

  assert {
    condition     = local.artifact_registry_location == "us-east1"
    error_message = "No se dedujo la región de Artifact Registry."
  }

  assert {
    condition     = length(module.triggers[0].trigger_names) == 3
    error_message = "Con realtime hay tres disparadores de Cloud Build (alternativa)."
  }

  # Nombres reales del esquema de la API (apps/api/src/core/config/config.schema.ts) y de F2-E/F2-I, más los de v7.
  assert {
    condition = alltrue([
      local.api_env["MODE"] == "api",
      local.api_env["QUEUE_DRIVER"] == "cloudtasks",
      local.api_env["GCP_PROJECT"] == "engynex-mirai-pruebas",
      local.api_env["GCP_LOCATION"] == "us-east1",
      local.api_env["API_BASE_URL"] == local.run_url.api,
      local.api_env["SCHEDULER_AUDIENCE"] == local.run_url.api,
      local.api_env["API_PUBLIC_URL"] == "https://api.pruebas.mirai.engynex.com",
      local.api_env["SITE_URL"] == "https://pruebas.mirai.engynex.com",
      local.api_env["TICK_DAILY_TASKS"] == "1",
      local.api_env["GIT_BRANCH"] == "pruebas",
      local.api_env["DB_ADAPTER"] == "pg",
      local.api_env["AUTH_PROVIDER"] == "mirai",
      local.api_env["BETTER_AUTH_URL"] == "https://pruebas.mirai.engynex.com",
      local.api_env["OBJECT_STORE"] == "gcs",
      local.api_env["GOOGLE_VERTEX_PROJECT"] == "engynex-mirai-pruebas",
      local.api_env["AI_PLATFORM_PROVIDER"] == "vertex",
      local.api_env["QUEUE_NOTIFY"] == "notify",
      local.api_env["SECRETS_SOURCE"] == "env",
      local.api_env["QUEUE_DEDUPE"] == "memory",
      contains(keys(local.api_env), "TASKS_SERVICE_ACCOUNT"),
      contains(keys(local.api_env), "SCHEDULER_SERVICE_ACCOUNTS"),
    ])
    error_message = "La API debe recibir las variables con los nombres de su esquema (v6 + v7)."
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
    condition     = contains(keys(local.mounted_secrets["api"]), "CRON_SECRET") && !contains(keys(local.mounted_secrets["api"]), "UPSTASH_REDIS_REST_TOKEN")
    error_message = "La API monta CRON_SECRET y no los secretos que no lee."
  }

  assert {
    condition     = local.mounted_secrets["api"]["DATABASE_URL"] == "database-url" && local.mounted_secrets["api"]["BETTER_AUTH_SECRET"] == "better-auth-secret" && local.mounted_secrets["migrate"]["DATABASE_URL"] == "database-admin-url"
    error_message = "v7: la API monta la base y Better Auth (generados); el trabajo de migraciones, el usuario dueño."
  }

  assert {
    condition     = toset(keys(local.generated_secrets)) == toset(["database-url", "database-admin-url", "better-auth-secret"])
    error_message = "La infraestructura genera la URL de la base (app y admin) y BETTER_AUTH_SECRET."
  }

  assert {
    condition     = local.path_rules_check == { web = ["/v1/*", "/api/auth/*", "/socket.io/*"], canary-web = ["/v1/*", "/api/auth/*"] }
    error_message = "Rutas del mismo origen en el balanceador: /v1 y /api/auth a la API, /socket.io al gateway."
  }

  assert {
    condition     = output.ci_variables.MIRAI_CLOUD == "gcp" && output.ci_variables.MIRAI_MIGRATE_JOB == "mirai-pruebas-db-migrate" && output.ci_variables.GCP_WORKLOAD_IDENTITY_PROVIDER == ""
    error_message = "Variables de GitHub Actions del ambiente."
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

run "paso_a_con_supabase" {
  command = plan

  variables {
    same_origin   = false
    auth_provider = "supabase"
    db_adapter    = "supabase"
    live_source   = "supabase"
    region        = "us-west1"
    features = {
      postgres = false
      realtime = false
      supabase = true
    }
    public_config = {
      NEXT_PUBLIC_SUPABASE_URL             = "https://ejemplo.supabase.co"
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_prueba"
    }
  }

  assert {
    condition     = length(module.cloud_sql) == 0 && length(module.realtime) == 0 && length(google_cloud_run_v2_job.migrate) == 0
    error_message = "Paso A: sin Cloud SQL ni gateway."
  }

  assert {
    condition     = local.api_env["SUPABASE_URL"] == "https://ejemplo.supabase.co" && contains(keys(local.mounted_secrets["realtime"]), "SUPABASE_SECRET_KEY") && local.api_env["DB_ADAPTER"] == "supabase"
    error_message = "El puente de Supabase manda su URL y monta su clave."
  }

  assert {
    condition     = strcontains(base64decode(local.web_build_env_b64), "NEXT_PUBLIC_API_URL=https://api.pruebas.mirai.engynex.com") && strcontains(base64decode(local.web_build_env_b64), "NEXT_PUBLIC_LIVE_SOURCE=supabase")
    error_message = "Sin mismo origen la API va por api. y la web sigue con Supabase Realtime."
  }

  assert {
    condition     = length(module.triggers[0].trigger_names) == 2 && length(local.host_rules) == 5
    error_message = "Sin realtime solo hay disparadores de web y api, y el balanceador no tiene rt."
  }
}

run "produccion_completa" {
  command = plan

  variables {
    environment = "produccion"
    features = {
      redis            = true
      realtime         = true
      postgrest        = true
      otel             = true
      scheduler_paused = false
      uptime_checks    = true
    }
    services = {
      realtime = { max_instances = 6 }
    }
    db_adapter = "postgrest"
    postgres = {
      tier              = "db-custom-2-7680"
      high_availability = true
    }
    gcp = {
      github_actions = {
        workload_identity_pool = "projects/123/locations/global/workloadIdentityPools/github"
        environment            = "produccion"
      }
    }
  }

  assert {
    condition     = length(module.cloud_sql) == 1 && length(module.redis) == 1 && length(module.realtime) == 1 && length(module.postgrest) == 1
    error_message = "Producción completa: Cloud SQL, Redis, realtime y PostgREST."
  }

  assert {
    condition     = contains(keys(local.mounted_secrets["realtime"]), "REDIS_URL") && contains(keys(local.mounted_secrets["api"]), "REDIS_URL") && !contains(keys(local.mounted_secrets["web"]), "REDIS_URL")
    error_message = "REDIS_URL se monta en api y realtime, no en la web."
  }

  assert {
    condition     = local.api_env["REALTIME_API_EMIT"] == "1" && local.api_env["POSTGREST_URL"] == local.run_url.postgrest && local.api_env["DB_ADAPTER"] == "postgrest"
    error_message = "Con Redis la API publica cambios; con PostgREST conoce su URL interna."
  }

  assert {
    condition     = local.api_egress == "ALL_TRAFFIC"
    error_message = "Con PostgREST (ingress interno) la API sale toda por la VPC."
  }

  assert {
    condition     = local.mounted_secrets["postgrest"]["PGRST_DB_URI"] == "postgrest-db-uri" && local.mounted_secrets["postgrest"]["PGRST_JWT_SECRET"] == "postgrest-jwt-secret" && length(local.mounted_secrets["postgrest"]) == 2
    error_message = "PostgREST solo monta su conexión y el secreto del JWT interno."
  }

  # Gateway: MODE=realtime, sin cron ni colas, con lo que pide el núcleo.
  assert {
    condition = alltrue([
      local.realtime_env["MODE"] == "realtime",
      local.realtime_env["MIRAI_ENV"] == "produccion",
      local.realtime_env["WEB_ORIGINS"] == local.api_env["WEB_ORIGINS"],
      local.realtime_env["REALTIME_PG_LISTEN"] == "1",
      length(setintersection(keys(local.realtime_env), ["SCHEDULER_AUDIENCE", "QUEUE_DRIVER", "API_BASE_URL", "TICK_DAILY_TASKS"])) == 0,
      contains(keys(local.mounted_secrets["realtime"]), "ENCRYPTION_KEY"),
      !contains(keys(local.mounted_secrets["realtime"]), "CRON_SECRET"),
    ])
    error_message = "El gateway recibe solo lo suyo."
  }

  assert {
    condition     = local.api_env["OTEL_EXPORTER_OTLP_ENDPOINT"] == "http://localhost:4318" && local.api_env["QUEUE_DEDUPE"] == "redis" && local.api_env["AI_PLATFORM_PROVIDER"] == "vertex"
    error_message = "OTEL al colector sidecar, deduplicación en Redis y Vertex primero."
  }

  assert {
    condition     = length(google_service_account_iam_member.deployer_github) == 1 && local.gha_principal == "principalSet://iam.googleapis.com/projects/123/locations/global/workloadIdentityPools/github/attribute.environment/produccion"
    error_message = "GitHub Actions entra a producción solo desde el entorno produccion."
  }

  assert {
    condition     = local.git_branch == "pruebas" && local.is_prod
    error_message = "La rama sale de cicd.branch_regex."
  }
}

run "realtime_sin_redis_falla" {
  command = plan

  variables {
    services = {
      realtime = { max_instances = 3 }
    }
  }

  expect_failures = [var.features]
}

run "secreto_en_public_config_falla" {
  command = plan

  variables {
    public_config = {
      WOMPI_EVENTS_SECRET = "no-va-aqui"
    }
  }

  expect_failures = [var.public_config]
}

run "gateway_sin_realtime_falla" {
  command = plan

  variables {
    features = {
      realtime = false
    }
  }

  expect_failures = [var.live_source]
}

run "pg_sin_postgres_falla" {
  command = plan

  variables {
    features = {
      postgres = false
      realtime = true
    }
  }

  expect_failures = [var.db_adapter]
}

run "region_no_contemplada_falla" {
  command = plan

  variables {
    region = "europe-west1"
  }

  expect_failures = [data.google_project.this]
}

run "worker_en_gcp_falla" {
  command = plan

  variables {
    features = {
      realtime = true
      worker   = true
    }
  }

  expect_failures = [data.google_project.this]
}
