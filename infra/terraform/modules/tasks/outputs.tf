output "queue_names" {
  description = "Clave → nombre corto de la cola."
  value       = { for k, q in google_cloud_tasks_queue.this : k => q.name }
}

output "queue_ids" {
  description = "Clave → ID completo (projects/<p>/locations/<r>/queues/<n>)."
  value       = { for k, q in google_cloud_tasks_queue.this : k => q.id }
}
