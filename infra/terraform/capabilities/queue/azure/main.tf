# Colas de trabajo en Azure Service Bus (Standard). Son de extracción: las consume MODE=worker con su identidad
# (rol Azure Service Bus Data Receiver); la API encola con Data Sender. Sin claves (local_auth_enabled = false).
# enabled = false → no se crea nada y el driver es "http" (la API se despacha a sí misma con CRON_SECRET).
# Equivalencias: max_attempts → max_delivery_count (después va a la cola de mensajes muertos), max_retry_s → TTL del
# mensaje. max_per_second, max_concurrent, backoff y log_sampling los controla el worker; `target` se ignora.
# cloud_options: namespace_name (string; por defecto <prefijo>-sb-<hash>, debe ser único en Azure), sku ("Standard").
# context.cloud: resource_group_name, subscription_id.

locals {
  rg        = var.context.cloud["resource_group_name"]
  hash      = substr(md5("${var.context.cloud["subscription_id"]}/${local.rg}"), 0, 6)
  namespace = try(var.cloud_options.namespace_name, "${var.context.prefix}-sb-${local.hash}")

  bindings = var.enabled ? merge(
    { for k, p in var.enqueuers : "send/${k}" => { principal = p, role = "Azure Service Bus Data Sender" } },
    { for k, p in var.consumers : "receive/${k}" => { principal = p, role = "Azure Service Bus Data Receiver" } },
  ) : {}
}

resource "azurerm_servicebus_namespace" "this" {
  count                         = var.enabled ? 1 : 0
  name                          = local.namespace
  resource_group_name           = local.rg
  location                      = var.context.region
  sku                           = try(var.cloud_options.sku, "Standard")
  local_auth_enabled            = false
  minimum_tls_version           = "1.2"
  public_network_access_enabled = true
  tags                          = var.context.labels
}

resource "azurerm_servicebus_queue" "this" {
  for_each                                = var.enabled ? var.queues : {}
  name                                    = each.key
  namespace_id                            = azurerm_servicebus_namespace.this[0].id
  max_delivery_count                      = max(8, each.value.max_attempts) # ≥ 8 antes de la cola de mensajes muertos
  default_message_ttl                     = "PT${each.value.max_retry_s}S"
  lock_duration                           = "PT5M"
  dead_lettering_on_message_expiration    = true
  requires_duplicate_detection            = true # la API manda el mismo id de tarea (notify-<hogar>-<AAAAMMDDHH>)
  duplicate_detection_history_time_window = "PT1H"
}

resource "azurerm_role_assignment" "this" {
  for_each             = local.bindings
  scope                = azurerm_servicebus_namespace.this[0].id
  role_definition_name = each.value.role
  principal_id         = each.value.principal
  principal_type       = "ServicePrincipal"
}
