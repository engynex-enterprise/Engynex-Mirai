output "bucket_names" {
  description = "Propósito → nombre del bucket."
  value       = module.this.names
}

output "bucket_ids" {
  description = "Propósito → gs://nombre."
  value       = module.this.urls
}

output "public_origin" {
  description = "Handle del bucket público para el balanceador (null si no hay bucket con public_read)."
  value       = try({ bucket = one([for k, b in var.buckets : module.this.names[k] if b.public_read]) }, null)
}

output "endpoints" {
  description = "Propósito → URL base de la API de Cloud Storage."
  value       = { for k, n in module.this.names : k => "https://storage.googleapis.com/${n}" }
}
