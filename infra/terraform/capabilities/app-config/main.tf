locals {
  is_prod = var.environment == "produccion"
  f       = var.features

  web_origin      = "https://${var.domains.web}"
  api_origin      = "https://${var.domains.api}"
  realtime_origin = "https://${var.domains.realtime}"
  files_origin    = "https://${var.domains.files}"

  # CORS de la API, origen permitido del WebSocket (WEB_ORIGINS) y CORS de los buckets.
  web_origins = distinct(concat([local.web_origin, "https://${var.domains.canary_web}"], var.extra_web_origins))

  # Lo que ve el navegador. Con el mismo origen (D2), la API y el gateway cuelgan del dominio de la web.
  browser_api_url      = var.same_origin ? local.web_origin : local.api_origin
  browser_realtime_url = var.same_origin ? local.web_origin : local.realtime_origin

  # ── Rutas del borde ───────────────────────────────────────────────────────────────────────────────────────────────
  # Dominio → origen. Los canarios (canary.*) los suma cada nube que los tenga.
  hosts = merge(
    { (var.domains.web) = "web", (var.domains.api) = "api" },
    local.f.realtime ? { (var.domains.realtime) = "realtime" } : {},
    local.f.storage ? { (var.domains.files) = "files" } : {},
  )
  canary_hosts = { (var.domains.canary_web) = "canary-web", (var.domains.canary_api) = "canary-api" }

  # Mismo origen: /v1/* y /api/auth/* → api; /socket.io/* → realtime. La web no tiene rutas propias con esos caminos
  # (sus Route Handlers son /api/{chat,cron,google,pagos,public}).
  routes = var.same_origin ? concat(
    [{ hosts = [var.domains.web, var.domains.canary_web], paths = ["/v1/*", "/api/auth/*"], origin = "api" }],
    local.f.realtime ? [{ hosts = [var.domains.web], paths = ["/socket.io/*"], origin = "realtime" }] : [],
  ) : []

  # ── Valores públicos que la API también lee (con sus nombres); vacíos = no se mandan ──────────────────────────────
  api_public = { for k, v in {
    GOOGLE_CLIENT_ID = lookup(var.public_config, "GOOGLE_CLIENT_ID", "")
    VAPID_PUBLIC_KEY = lookup(var.public_config, "NEXT_PUBLIC_VAPID_PUBLIC_KEY", "")
    VAPID_SUBJECT    = lookup(var.public_config, "VAPID_SUBJECT", "")
    WOMPI_PUBLIC_KEY = lookup(var.public_config, "NEXT_PUBLIC_WOMPI_PUBLIC_KEY", "")
  } : k => v if v != "" }

  # Lo que la API toma de public_config con su mismo nombre (correos de Better Auth).
  api_passthrough = { for k in ["AUTH_MAIL_FROM", "AUTH_SUPPORT_URL"] : k => var.public_config[k] if lookup(var.public_config, k, "") != "" }

  # OpenTelemetry (V7-Q): OTLP estándar al colector sidecar; logs siguen en JSON por stdout (sin duplicar costo).
  otel_env = local.f.otel ? {
    OTEL_TRACES_EXPORTER        = "otlp"
    OTEL_METRICS_EXPORTER       = "otlp"
    OTEL_LOGS_EXPORTER          = "none"
    OTEL_EXPORTER_OTLP_ENDPOINT = var.otel_endpoint
    OTEL_EXPORTER_OTLP_PROTOCOL = "http/protobuf"
    OTEL_TRACES_SAMPLER         = "parentbased_traceidratio"
    OTEL_TRACES_SAMPLER_ARG     = local.is_prod ? "0.1" : "1.0"
    OTEL_RESOURCE_ATTRIBUTES    = "deployment.environment=${var.environment}"
  } : {}

  supabase_env = { for k, v in {
    SUPABASE_URL             = lookup(var.public_config, "NEXT_PUBLIC_SUPABASE_URL", "")
    SUPABASE_PUBLISHABLE_KEY = lookup(var.public_config, "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "")
  } : k => v if v != "" && local.f.supabase }

  # ── Comunes a los tres modos de la misma imagen de la API (api, realtime, worker) ────────────────────────────────
  api_common_env = merge(
    {
      MIRAI_ENV     = var.environment
      NODE_ENV      = "production"
      LOG_LEVEL     = local.is_prod ? "info" : "debug"
      WEB_ORIGINS   = join(",", local.web_origins)
      DB_ADAPTER    = var.db_adapter
      AUTH_PROVIDER = var.auth_provider
      GIT_BRANCH    = var.git_branch
      # D8: los secretos llegan como variables que llena la plataforma (nunca un SDK de secretos en el arranque).
      SECRETS_SOURCE = "env"
    },
    local.supabase_env,
    local.otel_env,
    # Better Auth (D1): monta /api/auth/* en el mismo origen de la web. AUTH_DATABASE_URL no se manda: cae en
    # DATABASE_URL (la misma Postgres, esquema auth). Correos de auth por el proveedor de la plataforma.
    var.auth_provider == "mirai" ? {
      BETTER_AUTH_URL      = local.web_origin
      AUTH_TRUSTED_ORIGINS = join(",", local.web_origins)
      AUTH_MAIL_DRIVER     = "services"
      AUTH_PROXY_HOPS      = tostring(var.auth_proxy_hops)
    } : {},
    var.auth_provider == "mirai" ? local.api_passthrough : {},
    local.f.postgrest && var.internal_urls.postgrest != null ? { POSTGREST_URL = var.internal_urls.postgrest } : {},
  )

  storage_env = local.f.storage ? { PUBLIC_FILES_URL = local.files_origin } : {}

  api_env = merge(
    local.api_common_env,
    local.api_public,
    local.storage_env,
    {
      MODE = "api"
      # Enlaces: la web (correos, invitaciones, retorno de pagos y de Google) y la API pública
      # (<API_PUBLIC_URL>/v1/google/callback y los webhooks de pagos).
      SITE_URL           = local.web_origin
      API_PUBLIC_URL     = local.api_origin
      API_BASE_URL       = var.internal_urls.api # las colas y el cron llaman de vuelta por la URL interna
      TICK_DAILY_TASKS   = "1"                   # el tick encola refs, calendar, net-worth y plan-reminders
      AUTOMATIONS_OUTBOX = "1"
      # No encolar dos veces la misma tarea (notify-<hogar>-<AAAAMMDDHH>): Redis si existe (compartido entre instancias).
      QUEUE_DEDUPE = local.f.redis ? "redis" : "memory"
    },
    local.f.redis ? { REALTIME_API_EMIT = "1" } : {},
    var.cloud_env.api,
    var.api_env,
  )

  # Gateway: no monta /v1/jobs ni las colas, así que no lleva cron, colas ni API_BASE_URL.
  realtime_env = merge(
    local.api_common_env,
    { MODE = "realtime" },
    # Con la Postgres de la nube, el gateway escucha mirai_live (pg_notify) además de lo que publica la API.
    local.f.postgres && var.db_adapter != "supabase" ? { REALTIME_PG_LISTEN = "1" } : {},
    var.cloud_env.realtime,
    var.realtime_env,
  )

  # Worker (MODE=worker, V7-F): consume la cola (Postgres, SQS o Service Bus). Mismo entorno que la API.
  worker_env = merge(
    local.api_env,
    { MODE = "worker" },
    var.cloud_env.worker,
    var.worker_env,
  )

  postgrest_env = {
    PGRST_DB_SCHEMAS         = "public"
    PGRST_DB_ANON_ROLE       = "anon"
    PGRST_DB_POOL            = "10"
    PGRST_DB_CHANNEL_ENABLED = "true" # recarga del esquema con NOTIFY pgrst después de cada migración
    PGRST_OPENAPI_MODE       = "disabled"
    PGRST_SERVER_PORT        = "8080"
    PGRST_LOG_LEVEL          = local.is_prod ? "warn" : "info"
  }

  migrate_env = merge({ MIRAI_ENV = var.environment }, var.cloud_env.migrate)

  # ── Web ───────────────────────────────────────────────────────────────────────────────────────────────────────────
  web_live_env = merge(
    { NEXT_PUBLIC_LIVE_SOURCE = var.live_source },
    local.f.realtime ? { NEXT_PUBLIC_REALTIME_URL = local.browser_realtime_url } : {},
  )

  # NEXT_PUBLIC_* (y MIRAI_CSP_ENFORCE) se incrustan al compilar la imagen de la web (WEB_BUILD_ENV_B64 / GitHub vars).
  web_build_env = merge(
    { for k, v in var.public_config : k => v if startswith(k, "NEXT_PUBLIC_") || k == "MIRAI_CSP_ENFORCE" },
    {
      NEXT_PUBLIC_SITE_URL = local.web_origin
      NEXT_PUBLIC_API_URL  = local.browser_api_url
    },
    local.web_live_env,
  )
  web_build_env_text = join("\n", [for k in sort(keys(local.web_build_env)) : "${k}=${local.web_build_env[k]}"])

  web_env = merge(
    var.public_config,
    local.web_live_env,
    {
      MIRAI_ENV               = var.environment
      HOSTNAME                = "0.0.0.0"
      NEXT_TELEMETRY_DISABLED = "1"
      NEXT_PUBLIC_SITE_URL    = local.web_origin
      NEXT_PUBLIC_API_URL     = local.browser_api_url
      API_INTERNAL_URL        = var.internal_urls.api
    },
    var.cloud_env.web,
    var.web_env,
  )
}
