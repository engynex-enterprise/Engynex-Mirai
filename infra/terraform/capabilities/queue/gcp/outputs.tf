output "driver" {
  description = "cloudtasks o http."
  value       = var.enabled ? "cloudtasks" : "http"
}

output "queue_names" {
  description = "Clave → id de la cola (el literal que usa la API)."
  value       = var.enabled ? module.this[0].queue_names : {}
}

output "queue_ids" {
  description = "Clave → projects/<p>/locations/<r>/queues/<n>."
  value       = var.enabled ? module.this[0].queue_ids : {}
}

output "env" {
  description = "Variables de la API para encolar (CloudTasksQueue): driver, proyecto, región, cuenta OIDC y QUEUE_<COLA> = id."
  value = var.enabled ? merge(
    {
      QUEUE_DRIVER          = "cloudtasks"
      GCP_PROJECT           = var.context.cloud.project_id
      GCP_LOCATION          = var.context.region
      TASKS_SERVICE_ACCOUNT = var.target.identity
    },
    { for k, q in module.this[0].queue_names : "QUEUE_${upper(replace(k, "-", "_"))}" => q },
  ) : { QUEUE_DRIVER = "http" }
}
