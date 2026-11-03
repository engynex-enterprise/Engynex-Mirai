# Composición de un ambiente de Mirai en AWS con las capacidades de infra/terraform/capabilities/*/aws y la
# configuración sin nube de capabilities/app-config (variables, secretos, rutas: idénticas a GCP y Azure).

data "aws_caller_identity" "this" {}

locals {
  env        = var.environment
  is_prod    = var.environment == "produccion"
  prefix     = "mirai-${var.environment}"
  git_branch = local.is_prod ? "main" : "pruebas"

  labels = merge(var.labels, {
    app            = "mirai"
    ambiente       = var.environment
    gestionado-por = "terraform"
  })

  context = {
    prefix      = local.prefix
    environment = var.environment
    region      = var.region
    labels      = local.labels
    cloud       = { account_id = data.aws_caller_identity.this.account_id }
  }

  names = {
    web       = "${local.prefix}-web"
    api       = "${local.prefix}-api"
    realtime  = "${local.prefix}-realtime"
    worker    = "${local.prefix}-worker"
    postgrest = "${local.prefix}-postgrest"
    migrate   = "${local.prefix}-db-migrate"
  }

  # Service Connect: http://<servicio>.<espacio>:8080 (la conocen la web para SSR y la API para PostgREST).
  internal = { for k, n in local.names : k => "http://${n}.${module.platform.internal_domain}:8080" }

  # Con SQS (cola de extracción) siempre hay worker; con QUEUE_DRIVER=http la API se despacha a sí misma y no hay
  # worker (MODE=worker exige sqs o servicebus). Ver variables-aws.tf.
  worker_on = var.aws.queue_enabled

  app_features = {
    postgres  = var.features.postgres
    redis     = var.features.redis
    realtime  = var.features.realtime
    postgrest = var.features.postgrest
    worker    = local.worker_on
    storage   = var.features.storage
    supabase  = var.features.supabase
    vertex_ai = false
    otel      = var.features.otel
  }

  # Lo que pone AWS para la API y el worker: archivos en S3, colas (SQS o http) e IA de la plataforma (Bedrock con el
  # rol de la tarea: permiso abstracto "ai" → bedrock:InvokeModel*).
  cloud_api_env = merge(
    var.aws.bedrock ? { AI_PLATFORM_PROVIDER = "bedrock", AI_BEDROCK_REGION = coalesce(var.aws.bedrock_region, var.region) } : {},
    var.features.storage ? {
      OBJECT_STORE           = "s3"
      S3_REGION              = var.region
      STORAGE_BUCKET_PRIVATE = module.storage[0].bucket_names["private"]
      STORAGE_BUCKET_PUBLIC  = module.storage[0].bucket_names["public"]
      STORAGE_BUCKET_BACKUPS = module.storage[0].bucket_names["backups"]
    } : {},
    module.queue.env,
  )

  # Identidad de cada "servicio" del catálogo de secretos.
  svc_identity = {
    web       = "web"
    api       = "api"
    realtime  = "realtime"
    worker    = "worker"
    postgrest = "postgrest"
    migrate   = "migrator"
    scheduler = "scheduler"
  }

  # Servicio → { VARIABLE → ARN del secreto }.
  secret_env = {
    for svc, m in module.app.mounted_secrets : svc => { for n, k in m : n => module.secrets.refs[k] }
  }

  # ── Reglas del ALB interno (las mismas rutas del mismo origen que en GCP y Azure) ───────────────────────────────
  # Primero los caminos (/v1/*, /api/auth/*, /socket.io/*) y después cada dominio completo.
  path_rules = [for i, r in module.app.routes : { origin = r.origin, hosts = r.hosts, paths = r.paths, priority = 10 + i }]
  host_list  = sort(keys(module.app.hosts))
  host_rules = [
    for i, h in local.host_list : { origin = module.app.hosts[h], hosts = [h], paths = ["/*"], priority = 100 + i }
    if contains(["web", "api", "realtime"], module.app.hosts[h])
  ]
  svc_routes = {
    for o in ["web", "api", "realtime"] : o => [
      for r in concat(local.path_rules, local.host_rules) : { hosts = r.hosts, paths = r.paths, priority = r.priority } if r.origin == o
    ]
  }

  svc_options = { cpu_architecture = var.aws.cpu_architecture }

  # Colector OpenTelemetry (V7-Q) como sidecar de la API, el gateway y el worker (X-Ray y CloudWatch con el rol de la
  # tarea: permisos abstractos traces y metrics).
  otel_options = merge(local.svc_options, [for on in [var.features.otel] : {
    otel_collector = {
      image  = var.images.otel_collector
      config = file("${path.module}/../../../../otel/collector.aws.yaml")
      env    = { AWS_REGION = var.region, MIRAI_ENV = var.environment }
    }
  } if on]...)
}

module "app" {
  source = "../../../capabilities/app-config"

  environment       = var.environment
  git_branch        = local.git_branch
  domains           = var.domains
  same_origin       = var.same_origin
  extra_web_origins = var.extra_web_origins
  public_config     = var.public_config
  features          = local.app_features
  auth_provider     = var.auth_provider
  db_adapter        = var.db_adapter
  live_source       = var.live_source
  optional_secrets  = var.optional_secrets

  internal_urls = {
    api       = local.internal.api
    postgrest = var.features.postgrest ? local.internal.postgrest : null
  }

  cloud_env = {
    api    = local.cloud_api_env
    worker = local.cloud_api_env
  }

  api_env      = var.api_env
  realtime_env = var.realtime_env
  worker_env   = var.worker_env
  web_env      = var.web_env
}
