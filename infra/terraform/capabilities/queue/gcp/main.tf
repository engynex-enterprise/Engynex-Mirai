# queue (GCP): Cloud Tasks (envuelve modules/tasks). Empuja POST a la API con un token OIDC fijado en la cola; los
# ids de cola son literales (los de QueueName en la API). enabled = false → QUEUE_DRIVER=pg (cola en Postgres).
# `consumers` no aplica (Cloud Tasks empuja).

module "this" {
  count                      = var.enabled ? 1 : 0
  source                     = "../../../modules/tasks"
  project_id                 = var.context.cloud.project_id
  region                     = var.context.region
  oidc_service_account_email = var.target.identity
  oidc_audience              = coalesce(var.target.audience, var.target.url)
  enqueuers                  = var.enqueuers

  queues = {
    for k, q in var.queues : k => {
      max_dispatches_per_second = q.max_per_second
      max_concurrent_dispatches = q.max_concurrent
      max_attempts              = q.max_attempts
      min_backoff               = "${q.min_backoff_s}s"
      max_backoff               = "${q.max_backoff_s}s"
      max_retry_duration        = "${q.max_retry_s}s"
      log_sampling_ratio        = q.log_sampling
    }
  }
}
