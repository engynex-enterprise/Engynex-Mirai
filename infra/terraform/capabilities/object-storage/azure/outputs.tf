output "bucket_names" {
  description = "Propósito → nombre de la cuenta de almacenamiento (el contenedor siempre es `objetos`)."
  value       = { for k, a in azurerm_storage_account.this : k => a.name }
}

output "bucket_ids" {
  description = "Propósito → ID de la cuenta de almacenamiento."
  value       = { for k, a in azurerm_storage_account.this : k => a.id }
}

output "public_origin" {
  description = "Handles de los buckets públicos para el borde: host del blob, contenedor y camino de origen."
  value = {
    for k, a in azurerm_storage_account.this : k => {
      host        = a.primary_blob_host
      container   = local.container
      origin_path = "/${local.container}"
      account_id  = a.id
    } if var.buckets[k].public_read
  }
}

output "endpoints" {
  description = "Propósito → endpoint de blobs (https://<cuenta>.blob.core.windows.net/)."
  value       = { for k, a in azurerm_storage_account.this : k => a.primary_blob_endpoint }
}
