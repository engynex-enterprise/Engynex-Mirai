data "google_project" "this" {
  project_id = var.project_id
}

locals {
  env     = var.environment
  is_prod = var.environment == "produccion"
  prefix  = "mirai-${var.environment}"

  labels = merge(var.labels, {
    app            = "mirai"
    ambiente       = var.environment
    gestionado-por = "terraform"
  })

  project_number = data.google_project.this.number

  names = {
    web      = "${local.prefix}-web"
    api      = "${local.prefix}-api"
    realtime = "${local.prefix}-realtime"
  }

  # URL determinista de Cloud Run (https://<servicio>-<número de proyecto>.<región>.run.app): se conoce antes de
  # crear el servicio, así la API puede usar su propia URL como audiencia OIDC sin ciclos.
  run_url = { for k, n in local.names : k => "https://${n}-${local.project_number}.${var.region}.run.app" }

  web_origin      = "https://${var.domains.web}"
  api_origin      = "https://${var.domains.api}"
  realtime_origin = "https://${var.domains.realtime}"
  files_origin    = "https://${var.domains.files}"
  # CORS de la API, origen permitido del WebSocket (WEB_ORIGINS) y CORS de los buckets.
  web_origins = distinct(concat([local.web_origin, "https://${var.domains.canary_web}"], var.extra_web_origins))

  ingress = var.stages.load_balancer ? "INGRESS_TRAFFIC_INTERNAL_LOAD_BALANCER" : "INGRESS_TRAFFIC_ALL"

  run_tags = ["${local.prefix}-run"]

  private_services = var.stages.cloud_sql || var.stages.redis

  # NEXT_PUBLIC_* → archivo .env.production del build de la web (lo arma Cloud Build con esta sustitución).
  # Tiempo real: NEXT_PUBLIC_REALTIME_URL solo existe con stages.realtime y la web solo usa el gateway con
  # live_source = gateway (apps/web/hooks/use-live.ts); si no, sigue con Supabase Realtime.
  web_live_env = merge(
    { NEXT_PUBLIC_LIVE_SOURCE = var.live_source },
    var.stages.realtime ? { NEXT_PUBLIC_REALTIME_URL = local.realtime_origin } : {},
  )
  web_build_env = merge(
    { for k, v in var.public_config : k => v if startswith(k, "NEXT_PUBLIC_") || k == "MIRAI_CSP_ENFORCE" },
    {
      NEXT_PUBLIC_SITE_URL = local.web_origin
      NEXT_PUBLIC_API_URL  = local.api_origin
    },
    local.web_live_env,
  )
  web_build_env_b64 = base64encode(join("\n", [for k in sort(keys(local.web_build_env)) : "${k}=${local.web_build_env[k]}"]))
}
