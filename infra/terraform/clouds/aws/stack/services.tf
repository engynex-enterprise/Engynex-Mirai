# Servicios de ECS Fargate: web (Next.js standalone), api (NestJS, MODE=api), realtime (MODE=realtime, con
# stickiness), worker (MODE=worker: consume SQS) y postgrest (puente interno, D4). Misma imagen de la API
# para api, realtime y worker; la imagen la cambia el CI/CD (infra/deploy/aws/desplegar.sh).

module "web" {
  source        = "../../../capabilities/container-service/aws"
  context       = local.context
  platform      = module.platform.platform
  identity      = module.identity.handles["web"]
  name          = local.names.web
  description   = "Mirai web (Next.js) · ${local.env}"
  image         = var.images.web
  cpu           = var.services.web.cpu
  memory        = var.services.web.memory
  min_instances = var.services.web.min_instances
  max_instances = var.services.web.max_instances
  concurrency   = var.services.web.concurrency
  timeout_s     = var.services.web.timeout
  ingress       = "edge"
  routes        = local.svc_routes["web"]
  health_path   = "/api/public/version"
  env           = module.app.env.web
  secret_env    = local.secret_env["web"]
  cloud_options = merge(local.svc_options, { spot = var.aws.fargate_spot })
}

module "api" {
  source        = "../../../capabilities/container-service/aws"
  context       = local.context
  platform      = module.platform.platform
  identity      = module.identity.handles["api"]
  name          = local.names.api
  description   = "Mirai API (NestJS) · ${local.env}"
  image         = var.images.api
  cpu           = var.services.api.cpu
  memory        = var.services.api.memory
  min_instances = var.services.api.min_instances
  max_instances = var.services.api.max_instances
  concurrency   = var.services.api.concurrency
  timeout_s     = var.services.api.timeout
  ingress       = "edge"
  routes        = local.svc_routes["api"]
  health_path   = "/healthz"
  probes        = { startup = "tcp", liveness = true }
  env           = module.app.env.api
  secret_env    = local.secret_env["api"]
  cloud_options = local.otel_options
}

module "realtime" {
  count            = var.features.realtime ? 1 : 0
  source           = "../../../capabilities/container-service/aws"
  context          = local.context
  platform         = module.platform.platform
  identity         = module.identity.handles["realtime"]
  name             = local.names.realtime
  description      = "Mirai realtime (socket.io) · ${local.env}"
  image            = var.images.api
  cpu              = var.services.realtime.cpu
  memory           = var.services.realtime.memory
  min_instances    = var.services.realtime.min_instances
  max_instances    = var.services.realtime.max_instances
  concurrency      = var.services.realtime.concurrency
  timeout_s        = 3600
  always_on_cpu    = var.services.realtime.cpu_always_on
  session_affinity = true # socket.io con long-polling: todas las peticiones de una sesión a la misma tarea
  ingress          = "edge"
  routes           = local.svc_routes["realtime"]
  health_path      = "/healthz"
  probes           = { startup = "http", liveness = true }
  env              = module.app.env.realtime
  secret_env       = local.secret_env["realtime"]
  cloud_options    = local.otel_options
}

module "worker" {
  count         = local.worker_on ? 1 : 0
  source        = "../../../capabilities/container-service/aws"
  context       = local.context
  platform      = module.platform.platform
  identity      = module.identity.handles["worker"]
  name          = local.names.worker
  description   = "Mirai worker (colas) · ${local.env}"
  image         = var.images.api
  cpu           = var.services.worker.cpu
  memory        = var.services.worker.memory
  min_instances = var.services.worker.min_instances
  max_instances = var.services.worker.max_instances
  ingress       = "internal"
  health_path   = "/healthz"
  env           = module.app.env.worker
  secret_env    = local.secret_env["worker"]
  cloud_options = merge(local.otel_options, { spot = var.aws.fargate_spot })
}

module "postgrest" {
  count         = var.features.postgrest ? 1 : 0
  source        = "../../../capabilities/container-service/aws"
  context       = local.context
  platform      = module.platform.platform
  identity      = module.identity.handles["postgrest"]
  name          = local.names.postgrest
  description   = "Mirai PostgREST interno · ${local.env}"
  image         = var.images.postgrest
  cpu           = var.services.postgrest.cpu
  memory        = var.services.postgrest.memory
  min_instances = var.services.postgrest.min_instances
  max_instances = var.services.postgrest.max_instances
  concurrency   = var.services.postgrest.concurrency
  ingress       = "internal"
  health_path   = null
  env           = module.app.env.postgrest
  secret_env    = local.secret_env["postgrest"]
  cloud_options = local.svc_options
}
