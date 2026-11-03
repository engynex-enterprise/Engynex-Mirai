# Cloud Scheduler: reemplaza el cron de Vercel (apps/web/vercel.json) y el job `mirai-notify` de pg_cron + pg_net.
# Cada trabajo hace POST a /v1/jobs/* de la API con un token OIDC; el tick solo reparte en Cloud Tasks.

resource "google_cloud_scheduler_job" "this" {
  for_each         = var.jobs
  project          = var.project_id
  region           = var.region
  name             = "${var.prefix}-${each.key}"
  description      = each.value.description
  schedule         = each.value.schedule
  time_zone        = var.time_zone
  attempt_deadline = "${each.value.deadline_seconds}s"
  paused           = var.paused || each.value.paused

  retry_config {
    retry_count          = each.value.retry_count
    min_backoff_duration = "30s"
    max_backoff_duration = "600s"
    max_doublings        = 3
  }

  http_target {
    http_method = "POST"
    uri         = "${trimsuffix(var.target_base_url, "/")}${each.value.path}"
    body        = base64encode(each.value.body)
    headers = {
      "Content-Type" = "application/json"
      "User-Agent"   = "mirai-scheduler"
    }

    oidc_token {
      service_account_email = var.service_account_email
      audience              = var.audience
    }
  }
}
