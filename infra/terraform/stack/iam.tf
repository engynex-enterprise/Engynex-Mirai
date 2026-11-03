# Una cuenta de servicio por servicio, con lo mínimo. Los permisos finos (secretos, buckets, colas, invocar la API)
# se dan sobre cada recurso, no sobre el proyecto.

locals {
  observability_roles = [
    "roles/logging.logWriter",
    "roles/monitoring.metricWriter",
    "roles/cloudtrace.agent",
    "roles/errorreporting.writer",
  ]
  sql_roles = var.stages.cloud_sql ? ["roles/cloudsql.client", "roles/cloudsql.instanceUser"] : []
}

module "iam" {
  source     = "../modules/iam"
  project_id = var.project_id
  prefix     = local.prefix

  service_accounts = {
    web = {
      display_name  = "Mirai ${local.env} · web (Next.js)"
      description   = "Identidad del servicio web. Durante la transición lee secretos de Supabase; al final no tendrá secretos de negocio."
      project_roles = local.observability_roles
    }
    api = {
      display_name  = "Mirai ${local.env} · api (NestJS)"
      description   = "Identidad de la API: secretos, Cloud Tasks, Storage y Cloud SQL (IAM)."
      project_roles = concat(local.observability_roles, local.sql_roles, var.stages.identity_platform ? ["roles/firebaseauth.admin"] : [])
    }
    realtime = {
      display_name  = "Mirai ${local.env} · realtime (socket.io)"
      description   = "Gateway de WebSocket: Redis, LISTEN de Postgres."
      project_roles = concat(local.observability_roles, local.sql_roles)
    }
    scheduler = {
      display_name = "Mirai ${local.env} · Cloud Scheduler"
      description  = "Firma los tokens OIDC del cron hacia /v1/jobs/*."
    }
    tasks = {
      display_name = "Mirai ${local.env} · Cloud Tasks"
      description  = "Firma los tokens OIDC de las tareas hacia /v1/jobs/*."
    }
    migrator = {
      display_name  = "Mirai ${local.env} · migraciones SQL"
      description   = "Aplica supabase/migrations en Cloud SQL desde un trabajo de Cloud Run dentro de la VPC."
      project_roles = concat(["roles/logging.logWriter"], local.sql_roles)
    }
  }
}

# La API crea tareas con el token OIDC de la cuenta de Tasks (actAs).
resource "google_service_account_iam_member" "api_acts_as_tasks" {
  service_account_id = module.iam.ids["tasks"]
  role               = "roles/iam.serviceAccountUser"
  member             = module.iam.members["api"]
}

# URL firmadas V4 de Cloud Storage sin llave: la API firma con signBlob sobre su propia cuenta.
resource "google_service_account_iam_member" "api_signs_blobs" {
  service_account_id = module.iam.ids["api"]
  role               = "roles/iam.serviceAccountTokenCreator"
  member             = module.iam.members["api"]
}
