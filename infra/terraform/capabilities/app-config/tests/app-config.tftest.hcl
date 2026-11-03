# Pruebas del módulo sin nube: `cd infra/terraform/capabilities/app-config && terraform init && terraform test`.

variables {
  environment = "pruebas"
  git_branch  = "pruebas"
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
    NEXT_PUBLIC_SUPABASE_URL = "https://ejemplo.supabase.co"
    GOOGLE_CLIENT_ID         = "cliente.apps.googleusercontent.com"
    VAPID_SUBJECT            = "mailto:soporte@engynex.com"
    MIRAI_CSP_ENFORCE        = "0"
  }
  features = {
    postgres  = true
    redis     = true
    realtime  = true
    postgrest = true
    worker    = false
    storage   = true
    supabase  = false
    vertex_ai = false
    otel      = true
  }
  internal_urls = {
    api       = "https://api.interna"
    postgrest = "https://postgrest.interna"
  }
  cloud_env = {
    api = { QUEUE_DRIVER = "cloudtasks" }
  }
}

run "mismo_origen_v7" {
  command = plan

  assert {
    condition     = output.env.api.MODE == "api" && output.env.realtime.MODE == "realtime" && output.env.worker.MODE == "worker"
    error_message = "Cada modo de la misma imagen recibe su MODE."
  }

  assert {
    condition = alltrue([
      output.env.api.DB_ADAPTER == "pg",
      output.env.api.AUTH_PROVIDER == "mirai",
      output.env.api.BETTER_AUTH_URL == "https://pruebas.mirai.engynex.com",
      output.env.api.POSTGREST_URL == "https://postgrest.interna",
      output.env.api.API_BASE_URL == "https://api.interna",
      output.env.api.QUEUE_DRIVER == "cloudtasks",
      output.env.api.PUBLIC_FILES_URL == "https://files.pruebas.mirai.engynex.com",
      output.env.api.REALTIME_API_EMIT == "1",
      output.env.realtime.REALTIME_PG_LISTEN == "1",
      output.env.api.SECRETS_SOURCE == "env",
      output.env.api.QUEUE_DEDUPE == "redis",
      output.env.api.AUTH_TRUSTED_ORIGINS == "https://pruebas.mirai.engynex.com,https://canary.pruebas.mirai.engynex.com",
      output.env.api.OTEL_EXPORTER_OTLP_ENDPOINT == "http://localhost:4318",
      output.env.realtime.OTEL_TRACES_EXPORTER == "otlp",
    ])
    error_message = "Variables v7 de la API (Cloud SQL, Better Auth, PostgREST, colas, archivos)."
  }

  assert {
    condition     = !contains(keys(output.env.api), "SUPABASE_URL") && !contains(keys(output.mounted_secrets.api), "SUPABASE_SECRET_KEY")
    error_message = "Sin el puente de Supabase no se manda SUPABASE_URL ni se monta su clave."
  }

  assert {
    condition     = output.web_build_env.NEXT_PUBLIC_API_URL == "https://pruebas.mirai.engynex.com" && output.web_build_env.NEXT_PUBLIC_REALTIME_URL == "https://pruebas.mirai.engynex.com"
    error_message = "Con el mismo origen, el navegador llama a la API y al gateway por el dominio de la web."
  }

  assert {
    condition     = !contains(keys(output.web_build_env), "GOOGLE_CLIENT_ID") && output.web_build_env.MIRAI_CSP_ENFORCE == "0"
    error_message = "El build de la web solo recibe NEXT_PUBLIC_* y MIRAI_CSP_ENFORCE."
  }

  assert {
    condition     = length(output.routes) == 2 && contains(output.routes[0].paths, "/api/auth/*") && output.routes[1].origin == "realtime"
    error_message = "Rutas del mismo origen: /v1 y /api/auth a la API, /socket.io al gateway."
  }

  assert {
    condition     = output.mounted_secrets.postgrest.PGRST_JWT_SECRET == "postgrest-jwt-secret" && output.mounted_secrets.api.POSTGREST_JWT_SECRET == "postgrest-jwt-secret"
    error_message = "El mismo secreto llega con nombres distintos a PostgREST y a la API."
  }

  assert {
    condition     = output.mounted_secrets.migrate.DATABASE_URL == "database-admin-url" && output.mounted_secrets.api.DATABASE_URL == "database-url"
    error_message = "Las migraciones usan el usuario dueño; la API, el de la app."
  }

  assert {
    condition     = output.mounted_secrets.worker == output.mounted_secrets.api
    error_message = "El worker monta lo mismo que la API."
  }

  assert {
    condition     = contains(keys(output.mounted_secrets.scheduler), "CRON_SECRET") && !contains(keys(output.mounted_secrets.realtime), "CRON_SECRET")
    error_message = "El cron (AWS/Azure) lleva CRON_SECRET; el gateway no."
  }

  assert {
    condition     = toset(output.generated_secret_keys) == toset(["better-auth-secret", "database-url", "database-admin-url", "postgrest-db-uri", "postgrest-jwt-secret", "redis-url"])
    error_message = "Secretos que genera la infraestructura."
  }
}

run "paso_a_con_supabase" {
  command = plan

  variables {
    same_origin   = false
    auth_provider = "supabase"
    db_adapter    = "supabase"
    live_source   = "supabase"
    features = {
      postgres  = false
      redis     = false
      realtime  = false
      postgrest = false
      worker    = false
      storage   = true
      supabase  = true
      vertex_ai = false
      otel      = false
    }
    optional_secrets = ["google-client-secret"]
  }

  assert {
    condition     = output.env.api.SUPABASE_URL == "https://ejemplo.supabase.co" && contains(keys(output.mounted_secrets.web), "SUPABASE_SECRET_KEY")
    error_message = "El puente de Supabase manda su URL y monta su clave."
  }

  assert {
    condition     = length(output.routes) == 0 && output.web_build_env.NEXT_PUBLIC_API_URL == "https://api.pruebas.mirai.engynex.com"
    error_message = "Sin mismo origen, la API va por api."
  }

  assert {
    condition     = !contains(keys(output.secret_catalog), "database-url") && !contains(keys(output.secret_catalog), "better-auth-secret") && !contains(keys(output.env.realtime), "REALTIME_PG_LISTEN") && !contains(keys(output.env.api), "OTEL_TRACES_EXPORTER") && !contains(keys(output.env.api), "BETTER_AUTH_URL")
    error_message = "Sin Postgres de la nube ni Better Auth no existen sus secretos."
  }

  assert {
    condition     = contains(keys(output.mounted_secrets.web), "GOOGLE_CLIENT_SECRET") && !contains(keys(output.mounted_secrets.web), "VAPID_PRIVATE_KEY")
    error_message = "Solo se montan los opcionales con valor."
  }
}

run "secreto_desconocido_falla" {
  command = plan

  variables {
    optional_secrets = ["no-existe"]
  }

  expect_failures = [check.optional_secrets_conocidos]
}
