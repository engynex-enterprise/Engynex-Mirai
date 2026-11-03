# Cloud Tasks: colas de Mirai (docs/arquitectura/v6-separacion-front-back.md §2.7.8).
# - notify: una tarea por hogar en cada tick (nombre determinista notify-<hogar>-<AAAAMMDDHH>, sin duplicados).
# - automations: procesar un libro y las esperas cumplidas (scheduleTime).
# - slow: resúmenes con IA, importación v4, respaldos y sincronización de Calendar.
# El token OIDC se fija a nivel de cola: la API solo manda la URL y el cuerpo.

resource "google_cloud_tasks_queue" "this" {
  for_each = var.queues
  project  = var.project_id
  location = var.region
  name     = "${var.prefix}-${each.key}"

  rate_limits {
    max_dispatches_per_second = each.value.max_dispatches_per_second
    max_concurrent_dispatches = each.value.max_concurrent_dispatches
  }

  retry_config {
    max_attempts       = each.value.max_attempts
    min_backoff        = each.value.min_backoff
    max_backoff        = each.value.max_backoff
    max_retry_duration = each.value.max_retry_duration
    max_doublings      = 4
  }

  http_target {
    http_method = "POST"
    oidc_token {
      service_account_email = var.oidc_service_account_email
      audience              = var.oidc_audience
    }
  }

  stackdriver_logging_config {
    sampling_ratio = each.value.log_sampling_ratio
  }
}

locals {
  enqueuer_bindings = merge([
    for q in keys(var.queues) : { for k, m in var.enqueuers : "${q}/${k}" => { queue = q, member = m } }
  ]...)
}

resource "google_cloud_tasks_queue_iam_member" "enqueuers" {
  for_each = local.enqueuer_bindings
  project  = var.project_id
  location = var.region
  name     = google_cloud_tasks_queue.this[each.value.queue].name
  role     = "roles/cloudtasks.enqueuer"
  member   = each.value.member
}
