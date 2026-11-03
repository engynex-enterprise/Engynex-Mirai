# Alertas de Mirai (Cloud Monitoring). Error Reporting agrupa solo las excepciones de los registros de Cloud Run;
# su aviso de "error nuevo" se activa en la consola (no tiene recurso de Terraform; ver runbook).

locals {
  channels = [for c in google_monitoring_notification_channel.email : c.id]
  doc = {
    content   = "Mirai ${var.prefix}. Qué hacer: ${var.runbook_url} (sección Incidentes)."
    mime_type = "text/markdown"
  }
  latency_services = { for k, v in var.cloud_run_services : k => v if v.latency_p95_ms != null }
}

resource "google_monitoring_notification_channel" "email" {
  for_each     = var.notification_emails
  project      = var.project_id
  display_name = "Mirai ${var.prefix} · ${each.key}"
  type         = "email"
  labels = {
    email_address = each.value
  }
}

# ── Cloud Run: 5xx y latencia ──────────────────────────────────────────────────────────────────────────────────
resource "google_monitoring_alert_policy" "run_5xx" {
  for_each              = var.cloud_run_services
  project               = var.project_id
  display_name          = "${each.key}: errores 5xx > ${each.value.error_ratio * 100} %"
  combiner              = "OR"
  severity              = "CRITICAL"
  notification_channels = local.channels

  conditions {
    display_name = "Proporción de 5xx (5 min)"
    condition_threshold {
      filter             = "resource.type = \"cloud_run_revision\" AND resource.labels.service_name = \"${each.key}\" AND metric.type = \"run.googleapis.com/request_count\" AND metric.labels.response_code_class = \"5xx\""
      denominator_filter = "resource.type = \"cloud_run_revision\" AND resource.labels.service_name = \"${each.key}\" AND metric.type = \"run.googleapis.com/request_count\""
      comparison         = "COMPARISON_GT"
      threshold_value    = each.value.error_ratio
      duration           = "300s"

      aggregations {
        alignment_period     = "60s"
        per_series_aligner   = "ALIGN_RATE"
        cross_series_reducer = "REDUCE_SUM"
        group_by_fields      = ["resource.label.service_name"]
      }
      denominator_aggregations {
        alignment_period     = "60s"
        per_series_aligner   = "ALIGN_RATE"
        cross_series_reducer = "REDUCE_SUM"
        group_by_fields      = ["resource.label.service_name"]
      }
      trigger {
        count = 1
      }
    }
  }

  alert_strategy {
    auto_close = "1800s"
  }

  documentation {
    content   = local.doc.content
    mime_type = local.doc.mime_type
  }
}

resource "google_monitoring_alert_policy" "run_latency" {
  for_each              = local.latency_services
  project               = var.project_id
  display_name          = "${each.key}: latencia p95 > ${each.value.latency_p95_ms} ms"
  combiner              = "OR"
  severity              = "WARNING"
  notification_channels = local.channels

  conditions {
    display_name = "Latencia p95 (10 min)"
    condition_threshold {
      filter          = "resource.type = \"cloud_run_revision\" AND resource.labels.service_name = \"${each.key}\" AND metric.type = \"run.googleapis.com/request_latencies\""
      comparison      = "COMPARISON_GT"
      threshold_value = each.value.latency_p95_ms
      duration        = "600s"

      aggregations {
        alignment_period     = "300s"
        per_series_aligner   = "ALIGN_DELTA"
        cross_series_reducer = "REDUCE_PERCENTILE_95"
        group_by_fields      = ["resource.label.service_name"]
      }
      trigger {
        count = 1
      }
    }
  }

  alert_strategy {
    auto_close = "3600s"
  }

  documentation {
    content   = local.doc.content
    mime_type = local.doc.mime_type
  }
}

# ── Disponibilidad ─────────────────────────────────────────────────────────────────────────────────────────────
resource "google_monitoring_uptime_check_config" "this" {
  for_each     = var.uptime_checks
  project      = var.project_id
  display_name = "${var.prefix} ${each.key}"
  timeout      = "10s"
  period       = "60s"

  http_check {
    path         = each.value.path
    port         = 443
    use_ssl      = true
    validate_ssl = true
    accepted_response_status_codes {
      status_class = "STATUS_CLASS_2XX"
    }
  }

  monitored_resource {
    type = "uptime_url"
    labels = {
      project_id = var.project_id
      host       = each.value.host
    }
  }
}

resource "google_monitoring_alert_policy" "uptime" {
  for_each              = var.uptime_checks
  project               = var.project_id
  display_name          = "${var.prefix} ${each.key}: no responde"
  combiner              = "OR"
  severity              = "CRITICAL"
  notification_channels = local.channels

  conditions {
    display_name = "Chequeo fallido desde 2 o más regiones"
    condition_threshold {
      filter          = "metric.type = \"monitoring.googleapis.com/uptime_check/check_passed\" AND resource.type = \"uptime_url\" AND metric.labels.check_id = \"${google_monitoring_uptime_check_config.this[each.key].uptime_check_id}\""
      comparison      = "COMPARISON_GT"
      threshold_value = 1
      duration        = "120s"

      aggregations {
        alignment_period     = "300s"
        per_series_aligner   = "ALIGN_NEXT_OLDER"
        cross_series_reducer = "REDUCE_COUNT_FALSE"
        group_by_fields      = ["resource.label.host"]
      }
      trigger {
        count = 1
      }
    }
  }

  documentation {
    content   = local.doc.content
    mime_type = local.doc.mime_type
  }
}

# ── Cloud SQL ──────────────────────────────────────────────────────────────────────────────────────────────────
locals {
  sql_alerts = var.cloud_sql_instance == null ? {} : {
    cpu    = { metric = "cloudsql.googleapis.com/database/cpu/utilization", threshold = 0.8, name = "CPU > 80 %", severity = "WARNING" }
    memory = { metric = "cloudsql.googleapis.com/database/memory/utilization", threshold = 0.9, name = "memoria > 90 %", severity = "WARNING" }
    disk   = { metric = "cloudsql.googleapis.com/database/disk/utilization", threshold = 0.85, name = "disco > 85 %", severity = "CRITICAL" }
  }
}

resource "google_monitoring_alert_policy" "sql" {
  for_each              = local.sql_alerts
  project               = var.project_id
  display_name          = "Cloud SQL ${var.cloud_sql_instance}: ${each.value.name}"
  combiner              = "OR"
  severity              = each.value.severity
  notification_channels = local.channels

  conditions {
    display_name = each.value.name
    condition_threshold {
      filter          = "resource.type = \"cloudsql_database\" AND resource.labels.database_id = \"${var.project_id}:${coalesce(var.cloud_sql_instance, "-")}\" AND metric.type = \"${each.value.metric}\""
      comparison      = "COMPARISON_GT"
      threshold_value = each.value.threshold
      duration        = "600s"

      aggregations {
        alignment_period   = "60s"
        per_series_aligner = "ALIGN_MEAN"
      }
      trigger {
        count = 1
      }
    }
  }

  documentation {
    content   = local.doc.content
    mime_type = local.doc.mime_type
  }
}

# ── Redis ──────────────────────────────────────────────────────────────────────────────────────────────────────
resource "google_monitoring_alert_policy" "redis_memory" {
  count                 = var.redis_instance_id == null ? 0 : 1
  project               = var.project_id
  display_name          = "${var.prefix} Redis: memoria > 80 %"
  combiner              = "OR"
  severity              = "WARNING"
  notification_channels = local.channels

  conditions {
    display_name = "Uso de memoria"
    condition_threshold {
      filter          = "resource.type = \"redis_instance\" AND resource.labels.instance_id = \"${coalesce(var.redis_instance_id, "-")}\" AND metric.type = \"redis.googleapis.com/stats/memory/usage_ratio\""
      comparison      = "COMPARISON_GT"
      threshold_value = 0.8
      duration        = "600s"
      aggregations {
        alignment_period   = "60s"
        per_series_aligner = "ALIGN_MEAN"
      }
      trigger {
        count = 1
      }
    }
  }

  documentation {
    content   = local.doc.content
    mime_type = local.doc.mime_type
  }
}

# ── Cloud Tasks ────────────────────────────────────────────────────────────────────────────────────────────────
resource "google_monitoring_alert_policy" "queue_depth" {
  for_each              = toset(var.task_queues)
  project               = var.project_id
  display_name          = "Cola ${each.key}: más de ${var.queue_depth_threshold} tareas pendientes"
  combiner              = "OR"
  severity              = "WARNING"
  notification_channels = local.channels

  conditions {
    display_name = "Profundidad de la cola (15 min)"
    condition_threshold {
      filter          = "resource.type = \"cloud_tasks_queue\" AND resource.labels.queue_id = \"${each.key}\" AND metric.type = \"cloudtasks.googleapis.com/queue/depth\""
      comparison      = "COMPARISON_GT"
      threshold_value = var.queue_depth_threshold
      duration        = "900s"
      aggregations {
        alignment_period   = "60s"
        per_series_aligner = "ALIGN_MAX"
      }
      trigger {
        count = 1
      }
    }
  }

  documentation {
    content   = local.doc.content
    mime_type = local.doc.mime_type
  }
}

# ── Registros: fallas de Scheduler y errores de la app ─────────────────────────────────────────────────────────
resource "google_logging_metric" "scheduler_failures" {
  project     = var.project_id
  name        = "${var.prefix}-scheduler-fallas"
  description = "Ejecuciones fallidas de Cloud Scheduler (cron de avisos y trabajos)."
  filter      = "resource.type=\"cloud_scheduler_job\" AND resource.labels.job_id=~\"^${var.prefix}-\" AND severity>=ERROR"

  metric_descriptor {
    metric_kind = "DELTA"
    value_type  = "INT64"
    unit        = "1"
  }
}

resource "google_logging_metric" "app_errors" {
  project     = var.project_id
  name        = "${var.prefix}-app-errores"
  description = "Registros con severidad ERROR o más en los servicios de Cloud Run del ambiente."
  filter      = "resource.type=\"cloud_run_revision\" AND resource.labels.service_name=~\"^${var.prefix}-\" AND severity>=ERROR"

  metric_descriptor {
    metric_kind = "DELTA"
    value_type  = "INT64"
    unit        = "1"
  }
}

resource "google_monitoring_alert_policy" "scheduler_failures" {
  project               = var.project_id
  display_name          = "${var.prefix}: un trabajo de Scheduler falló"
  combiner              = "OR"
  severity              = "ERROR"
  notification_channels = local.channels

  conditions {
    display_name = "Fallas de Scheduler"
    condition_threshold {
      filter          = "resource.type = \"cloud_scheduler_job\" AND metric.type = \"logging.googleapis.com/user/${google_logging_metric.scheduler_failures.name}\""
      comparison      = "COMPARISON_GT"
      threshold_value = 0
      duration        = "0s"
      aggregations {
        alignment_period     = "300s"
        per_series_aligner   = "ALIGN_SUM"
        cross_series_reducer = "REDUCE_SUM"
      }
      trigger {
        count = 1
      }
    }
  }

  alert_strategy {
    auto_close = "3600s"
  }

  documentation {
    content   = local.doc.content
    mime_type = local.doc.mime_type
  }
}

resource "google_monitoring_alert_policy" "app_errors" {
  project               = var.project_id
  display_name          = "${var.prefix}: muchos errores en los registros"
  combiner              = "OR"
  severity              = "ERROR"
  notification_channels = local.channels

  conditions {
    display_name = "Errores en 5 min"
    condition_threshold {
      filter          = "resource.type = \"cloud_run_revision\" AND metric.type = \"logging.googleapis.com/user/${google_logging_metric.app_errors.name}\""
      comparison      = "COMPARISON_GT"
      threshold_value = var.app_error_threshold
      duration        = "0s"
      aggregations {
        alignment_period     = "300s"
        per_series_aligner   = "ALIGN_SUM"
        cross_series_reducer = "REDUCE_SUM"
      }
      trigger {
        count = 1
      }
    }
  }

  alert_strategy {
    auto_close = "3600s"
  }

  documentation {
    content   = local.doc.content
    mime_type = local.doc.mime_type
  }
}
