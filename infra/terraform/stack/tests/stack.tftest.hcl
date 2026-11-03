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
    condition     = contains(keys(local.mounted_secrets["realtime"]), "REDIS_AUTH") && contains(keys(local.mounted_secrets["api"]), "REDIS_AUTH")
    error_message = "La clave de Redis debe montarse en api y realtime."
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
    condition     = length(module.realtime) == 1 && length(module.redis) == 0 && !contains(keys(local.mounted_secrets["realtime"]), "REDIS_AUTH")
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
