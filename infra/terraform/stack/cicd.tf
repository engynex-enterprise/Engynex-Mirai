# CI/CD del ambiente. Cloud Build corre en el proyecto compartido (google.cicd) con una cuenta de despliegue por
# ambiente: solo puede desplegar en SU proyecto, empujar imágenes al repositorio y leer métricas para el canario.

resource "google_service_account" "deployer" {
  provider     = google.cicd
  project      = var.cicd_project_id
  account_id   = "${local.prefix}-deploy"
  display_name = "Mirai ${local.env} · despliegue (Cloud Build)"
  description  = "Despliega web, api y realtime en ${var.project_id}. Sin llaves."
}

locals {
  deployer_member = "serviceAccount:${google_service_account.deployer.email}"
  # <región>-docker.pkg.dev/<proyecto>/<repo> → <región>
  artifact_registry_location = split("-docker.pkg.dev", var.cicd.artifact_registry_path)[0]
}

resource "google_project_iam_member" "deployer_env" {
  for_each = toset([
    "roles/run.developer",     # desplegar revisiones y mover tráfico
    "roles/monitoring.viewer", # leer 5xx de la revisión nueva durante el canario
  ])
  project = var.project_id
  role    = each.value
  member  = local.deployer_member
}

resource "google_project_iam_member" "deployer_cicd" {
  for_each = toset([
    "roles/logging.logWriter",      # registros del build (CLOUD_LOGGING_ONLY)
    "roles/ondemandscanning.admin", # escaneo de vulnerabilidades bajo demanda
  ])
  provider = google.cicd
  project  = var.cicd_project_id
  role     = each.value
  member   = local.deployer_member
}

resource "google_artifact_registry_repository_iam_member" "deployer_writer" {
  provider   = google.cicd
  project    = var.cicd_project_id
  location   = local.artifact_registry_location
  repository = var.cicd.artifact_registry_repo
  role       = "roles/artifactregistry.writer"
  member     = local.deployer_member
}

# El agente de Cloud Run del ambiente descarga las imágenes del repositorio compartido.
resource "google_artifact_registry_repository_iam_member" "run_agent_reader" {
  provider   = google.cicd
  project    = var.cicd_project_id
  location   = local.artifact_registry_location
  repository = var.cicd.artifact_registry_repo
  role       = "roles/artifactregistry.reader"
  member     = "serviceAccount:service-${local.project_number}@serverless-robot-prod.iam.gserviceaccount.com"
}

# Desplegar con la identidad de cada servicio exige actAs sobre su cuenta.
resource "google_service_account_iam_member" "deployer_acts_as" {
  for_each           = toset(["web", "api", "realtime", "migrator"])
  service_account_id = module.iam.ids[each.value]
  role               = "roles/iam.serviceAccountUser"
  member             = local.deployer_member
}

locals {
  common_substitutions = {
    _ENV           = local.env
    _RUN_PROJECT   = var.project_id
    _REGION        = var.region
    _AR_REPO       = var.cicd.artifact_registry_path
    _FAIL_SEVERITY = var.cicd.fail_on_severity
    _CANARY_STEPS  = var.cicd.canary_steps
    _BAKE_SECONDS  = tostring(var.cicd.bake_seconds)
    _MAX_5XX_RATIO = var.cicd.max_5xx_ratio
  }

  shared_paths = ["packages/**", "pnpm-lock.yaml", "package.json", "pnpm-workspace.yaml", "turbo.json", "infra/cloudbuild/scripts/**"]

  triggers = merge(
    {
      deploy-web = {
        filename       = "infra/cloudbuild/deploy-web.yaml"
        description    = "Construye, escanea y despliega la web (${local.env}) con canario."
        included_files = concat(["apps/web/**", "infra/docker/web.Dockerfile*", "infra/cloudbuild/deploy-web.yaml"], local.shared_paths)
        substitutions = merge(local.common_substitutions, {
          _SERVICE           = local.names.web
          _CANARY_URL        = var.cicd.smoke_tests ? "https://${var.domains.canary_web}/api/public/version" : ""
          _WEB_BUILD_ENV_B64 = local.web_build_env_b64
        })
      }
      deploy-api = {
        filename       = "infra/cloudbuild/deploy-api.yaml"
        description    = "Construye (o promueve), escanea y despliega la API (${local.env}) con canario."
        included_files = concat(["apps/api/**", "supabase/migrations/**", "infra/cloudbuild/deploy-api.yaml"], local.shared_paths)
        substitutions = merge(local.common_substitutions, {
          _SERVICE     = local.names.api
          _CANARY_URL  = var.cicd.smoke_tests ? "https://${var.domains.canary_api}/healthz" : ""
          _DOCKERFILE  = "apps/api/Dockerfile"
          _MIGRATE_JOB = var.stages.cloud_sql ? google_cloud_run_v2_job.migrate[0].name : ""
        })
      }
    },
    var.stages.realtime ? {
      deploy-realtime = {
        filename       = "infra/cloudbuild/deploy-realtime.yaml"
        description    = "Despliega el gateway realtime (${local.env}) con la misma imagen aprobada de la API."
        included_files = concat(["apps/api/**", "infra/cloudbuild/deploy-realtime.yaml"], local.shared_paths)
        substitutions = merge(local.common_substitutions, {
          _SERVICE    = local.names.realtime
          _CANARY_URL = ""
        })
      }
    } : {},
  )
}

module "triggers" {
  count  = var.cicd.repository_id == null ? 0 : 1
  source = "../modules/cloudbuild-triggers"
  providers = {
    google = google.cicd
  }
  project_id         = var.cicd_project_id
  location           = var.cicd.location
  repository_id      = var.cicd.repository_id
  prefix             = local.prefix
  branch_regex       = var.cicd.branch_regex
  service_account_id = google_service_account.deployer.id
  approval_required  = var.cicd.approval_required
  triggers           = local.triggers
}
