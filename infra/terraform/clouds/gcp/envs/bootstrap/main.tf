# Bootstrap de Mirai en GCP (se aplica una vez, a mano, con una cuenta con permisos de administración):
# 1. (opcional) crea los proyectos cicd, pruebas y produccion;
# 2. habilita las APIs;
# 3. crea el bucket del estado remoto (con versiones; el backend gcs bloquea con un archivo .tflock);
# 4. crea Artifact Registry, la Workload Identity Federation para GitHub y las cuentas de Terraform;
# 5. (opcional) conecta GitHub con Cloud Build (2.ª generación) y crea el disparador de CI (alternativa: el CI/CD
#    principal es GitHub Actions, que entra por WIF con las cuentas de abajo y la de despliegue de cada ambiente).

locals {
  labels = { app = "mirai", gestionado-por = "terraform" }

  env_projects = { pruebas = var.projects.pruebas, produccion = var.projects.produccion }

  apis_common = [
    "cloudresourcemanager.googleapis.com",
    "serviceusage.googleapis.com",
    "iam.googleapis.com",
    "iamcredentials.googleapis.com",
    "sts.googleapis.com",
    "logging.googleapis.com",
    "monitoring.googleapis.com",
    "secretmanager.googleapis.com",
    "storage.googleapis.com",
    "billingbudgets.googleapis.com",
    "cloudbilling.googleapis.com",
  ]

  apis_cicd = [
    "artifactregistry.googleapis.com",
    "cloudbuild.googleapis.com",
    "containeranalysis.googleapis.com",
    "ondemandscanning.googleapis.com",
  ]

  apis_env = [
    "run.googleapis.com",
    "compute.googleapis.com",
    "servicenetworking.googleapis.com",
    "sqladmin.googleapis.com",
    "redis.googleapis.com",
    "cloudscheduler.googleapis.com",
    "cloudtasks.googleapis.com",
    "certificatemanager.googleapis.com",
    "cloudtrace.googleapis.com",
    "clouderrorreporting.googleapis.com",
    "identitytoolkit.googleapis.com", # solo si gcp.identity_platform.enabled (adaptador opcional)
    "recaptchaenterprise.googleapis.com",
    "aiplatform.googleapis.com",       # Vertex AI (D13): IA de la plataforma sin llave
    "dns.googleapis.com",              # Cloud DNS (opcional, features.dns)
    "artifactregistry.googleapis.com", # crea el agente de Cloud Run que lee imágenes
    "orgpolicy.googleapis.com",
  ]

  project_apis = merge(
    { for api in concat(local.apis_common, local.apis_cicd) : "cicd/${api}" => { project = var.projects.cicd, api = api } },
    merge([for env, p in local.env_projects : {
      for api in concat(local.apis_common, local.apis_env) : "${env}/${api}" => { project = p, api = api }
    }]...),
  )
}

# ── 1. Proyectos (opcional) ────────────────────────────────────────────────────────────────────────────────────
resource "google_project" "this" {
  for_each        = var.create_projects ? var.projects : {}
  project_id      = each.value
  name            = "Mirai ${each.key}"
  folder_id       = var.folder_id
  org_id          = var.folder_id == null ? var.org_id : null
  billing_account = var.billing_account
  labels          = merge(local.labels, { ambiente = each.key })
  deletion_policy = "PREVENT"

  auto_create_network = false
}

data "google_project" "this" {
  for_each   = var.projects
  project_id = each.value
  depends_on = [google_project.this]
}

# ── 2. APIs ────────────────────────────────────────────────────────────────────────────────────────────────────
resource "google_project_service" "this" {
  for_each                   = local.project_apis
  project                    = each.value.project
  service                    = each.value.api
  disable_on_destroy         = false
  disable_dependent_services = false
  depends_on                 = [google_project.this]
}

# ── 3. Estado remoto ───────────────────────────────────────────────────────────────────────────────────────────
resource "google_storage_bucket" "state" {
  project                     = var.projects.cicd
  name                        = var.state_bucket_name
  location                    = var.state_bucket_location
  storage_class               = "STANDARD"
  uniform_bucket_level_access = true
  public_access_prevention    = "enforced"
  force_destroy               = false
  labels                      = merge(local.labels, { proposito = "terraform-state" })

  versioning {
    enabled = true
  }

  soft_delete_policy {
    retention_duration_seconds = 30 * 86400
  }

  lifecycle_rule {
    action {
      type = "Delete"
    }
    condition {
      with_state         = "ARCHIVED"
      num_newer_versions = 50
    }
  }

  lifecycle {
    prevent_destroy = true
  }

  depends_on = [google_project_service.this]
}

# ── 4. Artifact Registry ───────────────────────────────────────────────────────────────────────────────────────
module "artifact_registry" {
  source = "../../../../capabilities/registry/gcp"
  context = {
    prefix      = "mirai-cicd"
    environment = "produccion" # el registro es compartido; se trata como de producción
    region      = var.region
    labels      = local.labels
    cloud       = { project_id = var.projects.cicd }
  }
  name = var.artifact_registry_repo

  depends_on = [google_project_service.this]
}

# ── 4b. Workload Identity Federation (GitHub Actions sin llaves) ───────────────────────────────────────────────
module "wif" {
  source = "../../../../capabilities/ci-identity/gcp"
  context = {
    prefix      = "mirai-cicd"
    environment = "produccion"
    region      = var.region
    labels      = local.labels
    cloud       = { project_id = var.projects.cicd }
  }
  github = {
    owner         = var.github_owner
    repository    = var.github_repository
    repository_id = var.github_repository_id
  }

  roles = {
    "mirai-tf-plan" = {
      display_name = "Terraform plan (solo lectura, cualquier rama/PR)"
    }
    "mirai-tf-pruebas" = {
      display_name = "Terraform apply en pruebas"
      refs         = ["refs/heads/pruebas", "refs/heads/main"]
    }
    "mirai-tf-produccion" = {
      display_name = "Terraform apply en producción (solo main + entorno de GitHub con revisores)"
      environments = ["produccion"]
    }
  }

  depends_on = [google_project_service.this]
}

locals {
  tf_plan    = module.wif.principals["mirai-tf-plan"]
  tf_apply   = { pruebas = module.wif.principals["mirai-tf-pruebas"], produccion = module.wif.principals["mirai-tf-produccion"] }
  plan_roles = ["roles/viewer", "roles/iam.securityReviewer", "roles/serviceusage.serviceUsageConsumer"]

  env_apply_roles = [
    "roles/run.admin",
    "roles/compute.networkAdmin",
    "roles/compute.securityAdmin",
    "roles/compute.loadBalancerAdmin",
    "roles/certificatemanager.owner",
    "roles/cloudsql.admin",
    "roles/redis.admin",
    "roles/cloudscheduler.admin",
    "roles/cloudtasks.admin",
    "roles/secretmanager.admin",
    "roles/storage.admin",
    "roles/iam.serviceAccountAdmin",
    "roles/iam.serviceAccountUser",
    "roles/resourcemanager.projectIamAdmin",
    "roles/monitoring.admin",
    "roles/logging.configWriter",
    "roles/servicenetworking.networksAdmin",
    "roles/serviceusage.serviceUsageConsumer",
    "roles/identitytoolkit.admin",
    "roles/dns.admin",
  ]

  cicd_apply_roles = [
    "roles/artifactregistry.admin",
    "roles/cloudbuild.connectionViewer",
    "roles/cloudbuild.builds.editor",
    "roles/iam.serviceAccountAdmin",
    "roles/iam.serviceAccountUser",
    "roles/resourcemanager.projectIamAdmin",
    "roles/serviceusage.serviceUsageConsumer",
    "roles/viewer",
  ]

  iam_bindings = merge(
    { for x in setproduct(keys(var.projects), local.plan_roles) : "plan/${x[0]}/${x[1]}" => { project = var.projects[x[0]], role = x[1], member = local.tf_plan } },
    merge([for env, member in local.tf_apply : merge(
      { for r in local.env_apply_roles : "${env}/${env}/${r}" => { project = var.projects[env], role = r, member = member } },
      { for r in local.cicd_apply_roles : "${env}/cicd/${r}" => { project = var.projects.cicd, role = r, member = member } },
    )]...),
  )
}

resource "google_project_iam_member" "terraform" {
  for_each = local.iam_bindings
  project  = each.value.project
  role     = each.value.role
  member   = each.value.member

  depends_on = [google_project_service.this]
}

# Estado: lectura para el plan (corre con -lock=false), escritura para los apply.
resource "google_storage_bucket_iam_member" "state_plan" {
  bucket = google_storage_bucket.state.name
  role   = "roles/storage.objectViewer"
  member = local.tf_plan
}

resource "google_storage_bucket_iam_member" "state_apply" {
  for_each = local.tf_apply
  bucket   = google_storage_bucket.state.name
  role     = "roles/storage.objectAdmin"
  member   = each.value
}

resource "google_billing_account_iam_member" "budgets" {
  for_each           = var.grant_billing_roles ? local.tf_apply : {}
  billing_account_id = var.billing_account
  role               = "roles/billing.costsManager"
  member             = each.value
}

# ── 4c. Excepciones de política de organización (bucket público de avatares y anuncios) ──────────────────────
resource "google_org_policy_policy" "allow_public_members" {
  for_each = var.manage_org_policy_exceptions ? local.env_projects : {}
  name     = "projects/${each.value}/policies/iam.allowedPolicyMemberDomains"
  parent   = "projects/${each.value}"

  spec {
    rules {
      allow_all = "TRUE"
    }
  }

  depends_on = [google_project_service.this]
}

resource "google_org_policy_policy" "public_access_prevention" {
  for_each = var.manage_org_policy_exceptions ? local.env_projects : {}
  name     = "projects/${each.value}/policies/storage.publicAccessPrevention"
  parent   = "projects/${each.value}"

  spec {
    rules {
      enforce = "FALSE"
    }
  }

  depends_on = [google_project_service.this]
}

# ── 5. GitHub ↔ Cloud Build (2.ª generación) ───────────────────────────────────────────────────────────────────
locals {
  github_connection = var.github_app_installation_id != null && var.github_oauth_token_secret_version != null
  github_secret     = local.github_connection ? regex("^(projects/[^/]+/secrets/[^/]+)/versions/", var.github_oauth_token_secret_version)[0] : null
}

resource "google_secret_manager_secret_iam_member" "cloudbuild_github_token" {
  count     = local.github_connection ? 1 : 0
  secret_id = local.github_secret
  role      = "roles/secretmanager.secretAccessor"
  member    = "serviceAccount:service-${data.google_project.this["cicd"].number}@gcp-sa-cloudbuild.iam.gserviceaccount.com"
}

resource "google_cloudbuildv2_connection" "github" {
  count    = local.github_connection ? 1 : 0
  project  = var.projects.cicd
  location = var.region
  name     = "github"

  github_config {
    app_installation_id = var.github_app_installation_id
    authorizer_credential {
      oauth_token_secret_version = var.github_oauth_token_secret_version
    }
  }

  depends_on = [google_secret_manager_secret_iam_member.cloudbuild_github_token]
}

resource "google_cloudbuildv2_repository" "mirai" {
  count             = local.github_connection ? 1 : 0
  project           = var.projects.cicd
  location          = var.region
  name              = var.github_repository
  parent_connection = google_cloudbuildv2_connection.github[0].name
  remote_uri        = "https://github.com/${var.github_owner}/${var.github_repository}.git"
}

# CI en Cloud Build (opcional): PR hacia pruebas o main → lint, typecheck, test y build. Cuenta sin permisos de despliegue.
resource "google_service_account" "ci" {
  count        = var.enable_ci_trigger ? 1 : 0
  project      = var.projects.cicd
  account_id   = "mirai-ci"
  display_name = "Mirai · CI (Cloud Build, sin despliegue)"
}

resource "google_project_iam_member" "ci_logs" {
  count   = var.enable_ci_trigger ? 1 : 0
  project = var.projects.cicd
  role    = "roles/logging.logWriter"
  member  = "serviceAccount:${google_service_account.ci[0].email}"
}

resource "google_cloudbuild_trigger" "ci" {
  count              = var.enable_ci_trigger && local.github_connection ? 1 : 0
  project            = var.projects.cicd
  location           = var.region
  name               = "mirai-ci-pr"
  description        = "CI de Mirai en cada PR hacia pruebas o main."
  filename           = "infra/cloudbuild/ci.yaml"
  service_account    = google_service_account.ci[0].id
  include_build_logs = "INCLUDE_BUILD_LOGS_WITH_STATUS"

  repository_event_config {
    repository = google_cloudbuildv2_repository.mirai[0].id
    pull_request {
      branch          = "^(pruebas|main)$"
      comment_control = "COMMENTS_ENABLED_FOR_EXTERNAL_CONTRIBUTORS_ONLY"
    }
  }
}

# ── Presupuesto del proyecto de CI/CD ──────────────────────────────────────────────────────────────────────────
resource "google_monitoring_notification_channel" "budget" {
  project      = var.projects.cicd
  display_name = "Mirai CI/CD · presupuesto"
  type         = "email"
  labels = {
    email_address = var.alert_email
  }
  depends_on = [google_project_service.this]
}

module "budget_cicd" {
  source                   = "../../../../modules/budget"
  billing_account          = var.billing_account
  project_number           = data.google_project.this["cicd"].number
  display_name             = "Mirai CI/CD"
  amount                   = var.cicd_budget_amount
  currency_code            = var.budget_currency
  notification_channel_ids = [google_monitoring_notification_channel.budget.id]
}

# v7: el registro y la federación de GitHub pasan por sus capacidades (capabilities/{registry,ci-identity}/gcp).
moved {
  from = module.artifact_registry.google_artifact_registry_repository.this
  to   = module.artifact_registry.module.this.google_artifact_registry_repository.this
}

moved {
  from = module.artifact_registry.google_artifact_registry_repository_iam_member.readers
  to   = module.artifact_registry.module.this.google_artifact_registry_repository_iam_member.readers
}

moved {
  from = module.artifact_registry.google_artifact_registry_repository_iam_member.writers
  to   = module.artifact_registry.module.this.google_artifact_registry_repository_iam_member.writers
}

moved {
  from = module.wif.google_iam_workload_identity_pool.this
  to   = module.wif.module.this.google_iam_workload_identity_pool.this
}

moved {
  from = module.wif.google_iam_workload_identity_pool_provider.github
  to   = module.wif.module.this.google_iam_workload_identity_pool_provider.github
}

moved {
  from = module.wif.google_service_account.this
  to   = module.wif.module.this.google_service_account.this
}

moved {
  from = module.wif.google_service_account_iam_member.wif
  to   = module.wif.module.this.google_service_account_iam_member.wif
}
