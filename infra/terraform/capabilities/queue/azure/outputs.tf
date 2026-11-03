output "driver" {
  description = "QUEUE_DRIVER: servicebus o pg."
  value       = var.enabled ? "servicebus" : "http"
}

output "queue_names" {
  description = "Clave → nombre de la cola (vacío con driver pg)."
  value       = { for k, q in azurerm_servicebus_queue.this : k => q.name }
}

output "queue_ids" {
  description = "Clave → ID de la cola."
  value       = { for k, q in azurerm_servicebus_queue.this : k => q.id }
}

output "env" {
  description = "Variables para la API y el worker."
  value = var.enabled ? merge(
    {
      QUEUE_DRIVER         = "servicebus"
      SERVICEBUS_NAMESPACE = "${local.namespace}.servicebus.windows.net"
    },
    { for k, q in azurerm_servicebus_queue.this : "QUEUE_${upper(replace(k, "-", "_"))}" => q.name },
  ) : { QUEUE_DRIVER = "http" }
}
