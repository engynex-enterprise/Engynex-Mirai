# Alertas de Mirai en Azure Monitor: un grupo de acciones con los correos y alertas de métricas.
# - Container Apps (services: clave = nombre de la app): peticiones 5xx en 5 min (Azure no calcula proporciones en una
#   alerta de métricas: se avisa cuando pasan de cloud_options.error_count_threshold, 20 por defecto; error_ratio se
#   ignora) y reinicios de réplicas. latency_p95_ms se ignora (Container Apps no publica p95 de latencia; se mira en
#   Application Insights cuando la API mande trazas OTLP).
# - Postgres (postgres_id): CPU > 80 %, memoria > 90 %, disco > 85 %. Redis (redis_id): memoria > 80 %.
# - Service Bus (queues): mensajes activos > queue_depth_threshold por cola (necesita cloud_options.servicebus_namespace_id;
#   con la cola en Postgres no hay nada que vigilar aquí).
# - Disponibilidad (uptime_checks): Application Insights + prueba web estándar desde 3 regiones; alerta si fallan 2.
# - app_error_threshold se ignora (la alerta por registros va con una regla de consulta de Log Analytics, pendiente).
# cloud_options: log_analytics_workspace_id (para Application Insights), servicebus_namespace_id,
#   error_count_threshold (20), watch_postgres / watch_redis / watch_queues (bool: si hay qué vigilar; por defecto
#   según los ids, pero un id que solo se conoce al aplicar no sirve para decidir cuántas alertas crear).
# context.cloud: resource_group_name, subscription_id.

locals {
  rg     = var.context.cloud["resource_group_name"]
  sub    = var.context.cloud["subscription_id"]
  ag_ids = [azurerm_monitor_action_group.this.id]

  error_count = try(var.cloud_options.error_count_threshold, 20)
  app_scope   = { for name, s in var.services : name => "/subscriptions/${local.sub}/resourceGroups/${local.rg}/providers/Microsoft.App/containerApps/${name}" }

  sb_namespace = try(var.cloud_options.servicebus_namespace_id, null)

  # Las banderas watch_* evitan que for_each dependa de ids que solo se conocen al aplicar (el stack las pasa).
  watch_postgres = try(var.cloud_options.watch_postgres, var.postgres_id != null)
  watch_redis    = try(var.cloud_options.watch_redis, var.redis_id != null)
  watch_queues   = try(var.cloud_options.watch_queues, local.sb_namespace != null)

  pg_alerts = !local.watch_postgres ? {} : {
    cpu     = { metric = "cpu_percent", threshold = 80, severity = 2, name = "CPU > 80 %" }
    memory  = { metric = "memory_percent", threshold = 90, severity = 2, name = "memoria > 90 %" }
    storage = { metric = "storage_percent", threshold = 85, severity = 1, name = "disco > 85 %" }
  }

  uptime = length(var.uptime_checks) > 0
}

resource "azurerm_monitor_action_group" "this" {
  name                = "${var.context.prefix}-alertas"
  resource_group_name = local.rg
  short_name          = substr(replace("mirai${var.context.environment}", "-", ""), 0, 12)
  tags                = var.context.labels

  dynamic "email_receiver" {
    for_each = var.notification_emails
    content {
      name                    = email_receiver.key
      email_address           = email_receiver.value
      use_common_alert_schema = true
    }
  }
}

resource "azurerm_monitor_metric_alert" "app_5xx" {
  for_each            = var.services
  name                = "${each.key}-5xx"
  resource_group_name = local.rg
  scopes              = [local.app_scope[each.key]]
  description         = "${each.key}: más de ${local.error_count} respuestas 5xx en 5 min. Qué hacer: ${var.runbook_url}"
  severity            = 1
  frequency           = "PT1M"
  window_size         = "PT5M"
  tags                = var.context.labels

  criteria {
    metric_namespace       = "Microsoft.App/containerApps"
    metric_name            = "Requests"
    aggregation            = "Total"
    operator               = "GreaterThan"
    threshold              = local.error_count
    skip_metric_validation = true
    dimension {
      name     = "statusCodeCategory"
      operator = "Include"
      values   = ["5xx"]
    }
  }

  action {
    action_group_id = azurerm_monitor_action_group.this.id
  }
}

resource "azurerm_monitor_metric_alert" "app_restarts" {
  for_each            = var.services
  name                = "${each.key}-reinicios"
  resource_group_name = local.rg
  scopes              = [local.app_scope[each.key]]
  description         = "${each.key}: réplicas reiniciándose. Qué hacer: ${var.runbook_url}"
  severity            = 2
  frequency           = "PT5M"
  window_size         = "PT15M"
  tags                = var.context.labels

  criteria {
    metric_namespace       = "Microsoft.App/containerApps"
    metric_name            = "RestartCount"
    aggregation            = "Maximum"
    operator               = "GreaterThan"
    threshold              = 3
    skip_metric_validation = true
  }

  action {
    action_group_id = azurerm_monitor_action_group.this.id
  }
}

resource "azurerm_monitor_metric_alert" "postgres" {
  for_each            = local.pg_alerts
  name                = "${var.context.prefix}-pg-${each.key}"
  resource_group_name = local.rg
  scopes              = [var.postgres_id]
  description         = "Postgres: ${each.value.name}. Qué hacer: ${var.runbook_url}"
  severity            = each.value.severity
  frequency           = "PT5M"
  window_size         = "PT15M"
  tags                = var.context.labels

  criteria {
    metric_namespace = "Microsoft.DBforPostgreSQL/flexibleServers"
    metric_name      = each.value.metric
    aggregation      = "Average"
    operator         = "GreaterThan"
    threshold        = each.value.threshold
  }

  action {
    action_group_id = azurerm_monitor_action_group.this.id
  }
}

resource "azurerm_monitor_metric_alert" "redis" {
  count               = local.watch_redis ? 1 : 0
  name                = "${var.context.prefix}-redis-memoria"
  resource_group_name = local.rg
  scopes              = [var.redis_id]
  description         = "Redis: memoria > 80 %. Qué hacer: ${var.runbook_url}"
  severity            = 2
  frequency           = "PT5M"
  window_size         = "PT15M"
  tags                = var.context.labels

  criteria {
    metric_namespace = "Microsoft.Cache/redis"
    metric_name      = "usedmemorypercentage"
    aggregation      = "Maximum"
    operator         = "GreaterThan"
    threshold        = 80
  }

  action {
    action_group_id = azurerm_monitor_action_group.this.id
  }
}

resource "azurerm_monitor_metric_alert" "queue_depth" {
  for_each            = local.watch_queues ? toset(var.queues) : toset([])
  name                = "${var.context.prefix}-cola-${each.key}"
  resource_group_name = local.rg
  scopes              = [local.sb_namespace]
  description         = "Cola ${each.key}: más de ${var.queue_depth_threshold} mensajes pendientes. Qué hacer: ${var.runbook_url}"
  severity            = 2
  frequency           = "PT5M"
  window_size         = "PT15M"
  tags                = var.context.labels

  criteria {
    metric_namespace = "Microsoft.ServiceBus/namespaces"
    metric_name      = "ActiveMessages"
    aggregation      = "Average"
    operator         = "GreaterThan"
    threshold        = var.queue_depth_threshold
    dimension {
      name     = "EntityName"
      operator = "Include"
      values   = [each.key]
    }
  }

  action {
    action_group_id = azurerm_monitor_action_group.this.id
  }
}

# ── Disponibilidad ─────────────────────────────────────────────────────────────────────────────────────────────
resource "azurerm_application_insights" "this" {
  count               = local.uptime ? 1 : 0
  name                = "${var.context.prefix}-insights"
  resource_group_name = local.rg
  location            = var.context.region
  application_type    = "web"
  workspace_id        = try(var.cloud_options.log_analytics_workspace_id, null)
  tags                = var.context.labels
}

resource "azurerm_application_insights_standard_web_test" "this" {
  for_each                = var.uptime_checks
  name                    = "${var.context.prefix}-${each.key}"
  resource_group_name     = local.rg
  location                = var.context.region
  application_insights_id = azurerm_application_insights.this[0].id
  geo_locations           = ["us-va-ash-azr", "us-tx-sn1-azr", "us-il-ch1-azr"]
  frequency               = 300
  timeout                 = 30
  enabled                 = true
  retry_enabled           = true
  tags                    = var.context.labels

  request {
    url       = "https://${each.value.host}${each.value.path}"
    http_verb = "GET"
  }

  validation_rules {
    expected_status_code        = 200
    ssl_check_enabled           = true
    ssl_cert_remaining_lifetime = 7
  }
}

resource "azurerm_monitor_metric_alert" "uptime" {
  for_each            = var.uptime_checks
  name                = "${var.context.prefix}-${each.key}-no-responde"
  resource_group_name = local.rg
  scopes              = [azurerm_application_insights_standard_web_test.this[each.key].id, azurerm_application_insights.this[0].id]
  description         = "${each.value.host}${each.value.path} no responde desde 2 o más regiones. Qué hacer: ${var.runbook_url}"
  severity            = 0
  tags                = var.context.labels

  application_insights_web_test_location_availability_criteria {
    web_test_id           = azurerm_application_insights_standard_web_test.this[each.key].id
    component_id          = azurerm_application_insights.this[0].id
    failed_location_count = 2
  }

  action {
    action_group_id = azurerm_monitor_action_group.this.id
  }
}
