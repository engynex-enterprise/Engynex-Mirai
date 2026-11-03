output "refs" {
  description = "Clave → secret_id (lo que usa Cloud Run en secret_key_ref)."
  value       = module.this.secret_ids
}

output "ids" {
  description = "Clave → projects/<p>/secrets/<id>."
  value       = module.this.ids
}
