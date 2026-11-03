# scheduler (GCP): Cloud Scheduler con OIDC (envuelve modules/scheduler). platform, identity y secret_ref no se usan:
# el token lo firma la cuenta de target.identity y la API lo valida en SchedulerGuard.

module "this" {
  source                = "../../../modules/scheduler"
  project_id            = var.context.cloud.project_id
  region                = var.context.region
  prefix                = var.context.prefix
  target_base_url       = var.target.base_url
  audience              = coalesce(var.target.audience, var.target.base_url)
  service_account_email = var.target.identity
  time_zone             = var.time_zone
  paused                = var.paused

  jobs = {
    for k, j in var.jobs : k => {
      schedule         = j.schedule
      path             = j.path
      description      = j.description
      body             = j.body
      deadline_seconds = j.deadline_s
      retry_count      = j.retry_count
      paused           = j.paused
    }
  }
}
