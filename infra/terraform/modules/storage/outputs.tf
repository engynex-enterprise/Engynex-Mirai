output "names" {
  description = "Propósito → nombre del bucket."
  value       = { for k, b in google_storage_bucket.this : k => b.name }
}

output "urls" {
  description = "Propósito → gs://nombre."
  value       = { for k, b in google_storage_bucket.this : k => b.url }
}
