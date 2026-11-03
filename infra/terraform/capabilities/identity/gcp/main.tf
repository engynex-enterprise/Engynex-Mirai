# identity (GCP): cuentas de servicio sin llaves (envuelve modules/iam). Permisos abstractos → roles del proyecto.

locals {
  roles = {
    logs    = ["roles/logging.logWriter"]
    metrics = ["roles/monitoring.metricWriter"]
    traces  = ["roles/cloudtrace.agent"]
    errors  = ["roles/errorreporting.writer"]
    sql     = ["roles/cloudsql.client", "roles/cloudsql.instanceUser"]
    ai      = ["roles/aiplatform.user"]
    idp     = ["roles/firebaseauth.admin"]
  }
}

module "this" {
  source     = "../../../modules/iam"
  project_id = var.context.cloud.project_id
  prefix     = var.context.prefix

  service_accounts = {
    for k, v in var.identities : k => {
      display_name  = v.display_name
      description   = v.description
      project_roles = distinct(flatten([for c in v.capabilities : local.roles[c]]))
    }
  }
}
