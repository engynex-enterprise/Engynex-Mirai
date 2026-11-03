output "queue_names" {
  description = "Clave → id de la cola (el mismo literal que usa la API)."
  value       = { for k, q in google_cloud_tasks_queue.this : k => q.name }
}

output "queue_ids" {
  description = "Clave → ID completo (projects/<p>/locations/<r>/queues/<n>)."
  value       = { for k, q in google_cloud_tasks_queue.this : k => q.id }
}
