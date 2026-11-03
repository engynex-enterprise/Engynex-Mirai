# Pruebas del stack de AWS sin nube: `cd infra/terraform/clouds/aws/stack && terraform init -backend=false && terraform test`.
# Proveedores simulados: se revisan expresiones, claves, validaciones y qué se crea en cada caso, sin credenciales.

mock_provider "aws" {
  override_during = plan

  mock_data "aws_caller_identity" {
    defaults = { account_id = "123456789012" }
  }
  mock_data "aws_availability_zones" {
    defaults = { names = ["us-east-1a", "us-east-1b", "us-east-1c"] }
  }
  mock_data "aws_partition" {
    defaults = { partition = "aws" }
  }
  mock_resource "aws_iam_role" {
    defaults = { arn = "arn:aws:iam::123456789012:role/mirai-prueba" }
  }
  mock_resource "aws_secretsmanager_secret" {
    defaults = { arn = "arn:aws:secretsmanager:us-east-1:123456789012:secret:mirai-prueba" }
  }
  mock_resource "aws_ecs_task_definition" {
    defaults = {
      arn                  = "arn:aws:ecs:us-east-1:123456789012:task-definition/mirai-prueba:1"
      arn_without_revision = "arn:aws:ecs:us-east-1:123456789012:task-definition/mirai-prueba"
    }
  }
  mock_resource "aws_lb" {
    defaults = { arn = "arn:aws:elasticloadbalancing:us-east-1:123456789012:loadbalancer/app/mirai/abc", arn_suffix = "app/mirai/abc", dns_name = "internal-mirai.us-east-1.elb.amazonaws.com" }
  }
  mock_resource "aws_lb_target_group" {
    defaults = { arn = "arn:aws:elasticloadbalancing:us-east-1:123456789012:targetgroup/mirai/abc", arn_suffix = "targetgroup/mirai/abc" }
  }
  mock_resource "aws_service_discovery_http_namespace" {
    defaults = { arn = "arn:aws:servicediscovery:us-east-1:123456789012:namespace/ns-abc" }
  }
  mock_resource "aws_ecs_cluster" {
    defaults = { arn = "arn:aws:ecs:us-east-1:123456789012:cluster/mirai" }
  }
  mock_resource "aws_sns_topic" {
    defaults = { arn = "arn:aws:sns:us-east-1:123456789012:mirai-alertas" }
  }
  mock_resource "aws_wafv2_web_acl" {
    defaults = { arn = "arn:aws:wafv2:us-east-1:123456789012:global/webacl/mirai/abc" }
  }
  mock_resource "aws_acm_certificate" {
    defaults = { arn = "arn:aws:acm:us-east-1:123456789012:certificate/abc" }
  }
  mock_resource "aws_acm_certificate_validation" {
    defaults = { certificate_arn = "arn:aws:acm:us-east-1:123456789012:certificate/abc" }
  }
  mock_resource "aws_s3_bucket" {
    defaults = { arn = "arn:aws:s3:::mirai-prueba" }
  }
  mock_resource "aws_sqs_queue" {
    defaults = { arn = "arn:aws:sqs:us-east-1:123456789012:mirai-prueba", url = "https://sqs.us-east-1.amazonaws.com/123456789012/mirai-prueba" }
  }
}

mock_provider "aws" {
  alias           = "us_east_1"
  override_during = plan

  mock_resource "aws_acm_certificate" {
    defaults = { arn = "arn:aws:acm:us-east-1:123456789012:certificate/abc" }
  }
  mock_resource "aws_acm_certificate_validation" {
    defaults = { certificate_arn = "arn:aws:acm:us-east-1:123456789012:certificate/abc" }
  }
  mock_resource "aws_wafv2_web_acl" {
    defaults = { arn = "arn:aws:wafv2:us-east-1:123456789012:global/webacl/mirai/abc" }
  }
  mock_resource "aws_sns_topic" {
    defaults = { arn = "arn:aws:sns:us-east-1:123456789012:mirai-disponibilidad" }
  }
}

mock_provider "random" {}

variables {
  environment   = "pruebas"
  region        = "us-east-1"
  bucket_suffix = "engynex"
  network       = { cidr = "10.30.0.0/16" }
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
    GOOGLE_CLIENT_ID = "cliente.apps.googleusercontent.com"
    VAPID_SUBJECT    = "mailto:soporte@engynex.com"
  }
  features = {
    realtime = true
    redis    = false
  }
  services = {
    realtime = { max_instances = 1 }
  }
  alert_emails = { dueno = "alertas@engynex.com" }
  aws = {
    registry_url = "123456789012.dkr.ecr.us-east-1.amazonaws.com/mirai"
  }
}

run "pruebas" {
  command = plan

  assert {
    condition = alltrue([
      module.app.env.api.MODE == "api",
      module.app.env.api.DB_ADAPTER == "pg",
      module.app.env.api.AUTH_PROVIDER == "mirai",
      module.app.env.api.QUEUE_DRIVER == "sqs",
      module.app.env.api.OBJECT_STORE == "s3",
      module.app.env.api.S3_REGION == "us-east-1",
      module.app.env.api.API_BASE_URL == "http://mirai-pruebas-api.mirai-pruebas.interno:8080",
      module.app.env.worker.MODE == "worker",
      module.app.env.worker.QUEUE_DRIVER == "sqs",
      module.app.env.realtime.MODE == "realtime",
      !contains(keys(module.app.env.realtime), "QUEUE_DRIVER"),
    ])
    error_message = "La API, el worker y el gateway reciben las variables de AWS (S3, SQS, Service Connect)."
  }

  assert {
    condition     = contains(keys(module.app.env.api), "QUEUE_NOTIFY") && contains(keys(module.app.env.api), "QUEUE_SLOW") && module.app.env.api.AI_PLATFORM_PROVIDER == "bedrock" && module.app.env.api.SECRETS_SOURCE == "env"
    error_message = "La API conoce la URL de cada cola de SQS."
  }

  assert {
    condition = alltrue([
      contains(keys(local.secret_env.api), "DATABASE_URL"),
      contains(keys(local.secret_env.api), "BETTER_AUTH_SECRET"),
      contains(keys(local.secret_env.web), "ENCRYPTION_KEY"),
      !contains(keys(local.secret_env.web), "DATABASE_URL"),
      !contains(keys(local.secret_env.api), "SUPABASE_SECRET_KEY"),
      module.app.mounted_secrets.migrate.DATABASE_URL == "database-admin-url",
      contains(keys(local.secret_env.scheduler), "CRON_SECRET"),
    ])
    error_message = "Secretos montados por servicio (sin Supabase; migraciones con el administrador)."
  }

  assert {
    condition     = length(module.realtime) == 1 && length(module.redis) == 0 && length(module.postgrest) == 0 && length(module.worker) == 1
    error_message = "Pruebas: realtime de una instancia sin Redis, sin PostgREST y con worker (SQS)."
  }

  assert {
    condition     = local.svc_routes.api[0].priority == 10 && contains(local.svc_routes.api[0].paths, "/api/auth/*") && contains(local.svc_routes.api[0].hosts, "pruebas.mirai.engynex.com")
    error_message = "El ALB manda /v1/* y /api/auth/* del dominio de la web a la API, antes que la regla de la web."
  }

  assert {
    condition     = contains(local.svc_routes.realtime[0].paths, "/socket.io/*") && length([for r in local.svc_routes.web : r if contains(r.hosts, "pruebas.mirai.engynex.com")]) == 1
    error_message = "/socket.io/* va al gateway y el resto del dominio de la web, a la web."
  }

  assert {
    condition     = module.realtime[0].edge_origin.kind == "alb" && length(module.edge) == 1
    error_message = "Realtime detrás del ALB interno y del borde."
  }

  assert {
    condition     = output.ci_variables.MIRAI_CLOUD == "aws" && output.ci_variables.MIRAI_SERVICE_WORKER == "mirai-pruebas-worker" && output.ci_variables.MIRAI_MIGRATE_JOB == "mirai-pruebas-db-migrate"
    error_message = "Variables de GitHub del entorno."
  }

  assert {
    condition     = toset(keys(local.scheduler_jobs)) == toset(["automations-drain", "notify-tick"])
    error_message = "El cron solo llama al tick y al drain."
  }

  assert {
    condition     = strcontains(module.app.web_build_env_text, "NEXT_PUBLIC_API_URL=https://pruebas.mirai.engynex.com")
    error_message = "Mismo origen: el navegador llama a la API por el dominio de la web."
  }
}

run "produccion_completa" {
  command = plan

  variables {
    environment         = "produccion"
    deletion_protection = true
    domains = {
      web                       = "mirai.engynex.com"
      api                       = "api.mirai.engynex.com"
      realtime                  = "rt.mirai.engynex.com"
      files                     = "files.mirai.engynex.com"
      canary_web                = "canary.mirai.engynex.com"
      canary_api                = "canary-api.mirai.engynex.com"
      certificate               = ["mirai.engynex.com", "*.mirai.engynex.com"]
      dns_authorization_domains = ["mirai.engynex.com"]
    }
    features = {
      redis            = true
      realtime         = true
      postgrest        = true
      scheduler_paused = false
      uptime_checks    = true
      dns              = true
    }
    dns        = { zone_name = "mirai.engynex.com" }
    db_adapter = "postgrest"
    services = {
      realtime = { max_instances = 6 }
    }
    postgres = { size = "m", high_availability = true }
    redis    = { high_availability = true }
    aws = {
      registry_url = "123456789012.dkr.ecr.us-east-1.amazonaws.com/mirai"
      nat_per_zone = true
    }
  }

  assert {
    condition     = length(module.redis) == 1 && length(module.postgrest) == 1 && length(module.postgres) == 1 && length(module.dns) == 1
    error_message = "Producción con Redis, PostgREST, RDS y zona DNS."
  }

  assert {
    condition = alltrue([
      module.app.env.api.DB_ADAPTER == "postgrest",
      module.app.env.api.POSTGREST_URL == "http://mirai-produccion-postgrest.mirai-produccion.interno:8080",
      module.app.env.api.REALTIME_API_EMIT == "1",
      module.app.mounted_secrets.postgrest.PGRST_JWT_SECRET == "postgrest-jwt-secret",
      contains(keys(local.secret_env.postgrest), "PGRST_DB_URI"),
      contains(keys(local.secret_env.realtime), "REDIS_URL"),
    ])
    error_message = "PostgREST, Redis y sus secretos en producción."
  }

  assert {
    condition     = toset(keys(module.monitoring.uptime_check_ids)) == toset(["api", "realtime", "web"])
    error_message = "Chequeos de disponibilidad de web, api y realtime."
  }

  assert {
    condition     = module.app.env.api.LOG_LEVEL == "info" && module.app.env.api.GIT_BRANCH == "main"
    error_message = "Producción: registros info y rama main."
  }
}

run "sin_cola_despacho_http" {
  command = plan

  variables {
    aws = {
      registry_url  = "123456789012.dkr.ecr.us-east-1.amazonaws.com/mirai"
      queue_enabled = false
    }
  }

  assert {
    condition     = module.app.env.api.QUEUE_DRIVER == "http" && length(module.worker) == 0 && length(module.queue.queue_names) == 0
    error_message = "Sin SQS la API se despacha por HTTP y no hay worker."
  }
}

run "realtime_sin_redis_falla" {
  command = plan

  variables {
    features = { realtime = true, redis = false }
    services = { realtime = { max_instances = 3 } }
  }

  expect_failures = [var.features]
}

run "registro_mal_escrito_falla" {
  command = plan

  variables {
    aws = { registry_url = "ghcr.io/engynex/mirai" }
  }

  expect_failures = [var.aws]
}

run "otel_sidecar" {
  command = plan

  variables {
    features = {
      postgres = true
      realtime = true
      otel     = true
    }
  }

  assert {
    condition     = local.otel_options.otel_collector.env.AWS_REGION == var.region && module.app.env.api.OTEL_EXPORTER_OTLP_ENDPOINT == "http://localhost:4318"
    error_message = "El colector va como sidecar con su región y la API exporta OTLP a localhost."
  }
}
