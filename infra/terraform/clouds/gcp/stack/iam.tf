# Una cuenta de servicio por servicio, con lo mínimo (capacidad identity). Los permisos finos (secretos, buckets,
# colas, invocar la API) se dan sobre cada recurso, no sobre el proyecto.

locals {
  obs = ["logs", "metrics", "traces", "errors"]
  sql = local.f.postgres ? ["sql"] : []
  ai  = local.vertex ? ["ai"] : []

  identities = merge(
    {
      web = {
        display_name = "Mirai ${local.env} · web (Next.js)"
        description  = "Identidad del servicio web. Durante la transición lee secretos de Supabase; al final no tendrá secretos de negocio."
        capabilities = local.obs
      }
      api = {
        display_name = "Mirai ${local.env} · api (NestJS)"
        description  = "Identidad de la API: secretos, Cloud Tasks, Storage, Cloud SQL (IAM) y Vertex AI."
        capabilities = concat(local.obs, local.sql, local.ai, var.gcp.identity_platform.enabled ? ["idp"] : [])
      }
      realtime = {
        display_name = "Mirai ${local.env} · realtime (socket.io)"
        description  = "Gateway de WebSocket: Redis, LISTEN de Postgres."
        capabilities = concat(local.obs, local.sql)
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
        display_name = "Mirai ${local.env} · migraciones SQL"
        description  = "Aplica las migraciones en Cloud SQL desde un trabajo de Cloud Run dentro de la VPC."
        capabilities = concat(["logs"], local.sql)
      }
    },
    local.f.postgrest ? {
      postgrest = {
        display_name = "Mirai ${local.env} · postgrest (interno)"
        description  = "Puente PostgREST interno (D4): solo lo llama la API con un JWT de 60 s."
        capabilities = ["logs", "metrics"]
      }
    } : {},
  )

  # Servicio del catálogo de secretos → identidad que lo lee (el cron de GCP usa OIDC, no CRON_SECRET).
  service_identity = { web = "web", api = "api", realtime = "realtime", worker = "worker", postgrest = "postgrest", migrate = "migrator" }

  sa = module.iam.handles
}

module "iam" {
  source     = "../../../capabilities/identity/gcp"
  context    = local.context
  identities = local.identities
}

# La API crea tareas con el token OIDC de la cuenta de Tasks (actAs).
resource "google_service_account_iam_member" "api_acts_as_tasks" {
  service_account_id = local.sa["tasks"].id
  role               = "roles/iam.serviceAccountUser"
  member             = local.sa["api"].member
}

# URL firmadas V4 de Cloud Storage sin llave: la API firma con signBlob sobre su propia cuenta.
resource "google_service_account_iam_member" "api_signs_blobs" {
  service_account_id = local.sa["api"].id
  role               = "roles/iam.serviceAccountTokenCreator"
  member             = local.sa["api"].member
}
