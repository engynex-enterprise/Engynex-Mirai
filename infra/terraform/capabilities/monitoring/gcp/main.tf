# monitoring (GCP): Cloud Monitoring (envuelve modules/monitoring): 5xx y latencia de Cloud Run, disponibilidad,
# Cloud SQL, Redis, profundidad de Cloud Tasks, fallas de Scheduler y errores en los registros.

module "this" {
  source                = "../../../modules/monitoring"
  project_id            = var.context.cloud.project_id
  prefix                = var.context.prefix
  notification_emails   = var.notification_emails
  runbook_url           = var.runbook_url
  cloud_run_services    = var.services
  uptime_checks         = var.uptime_checks
  cloud_sql_instance    = var.postgres_id
  redis_instance_id     = var.redis_id
  task_queues           = var.queues
  queue_depth_threshold = var.queue_depth_threshold
  app_error_threshold   = var.app_error_threshold
}
