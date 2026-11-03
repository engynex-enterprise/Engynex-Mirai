# Blob Storage: una cuenta de almacenamiento por bucket con un contenedor `objetos`. Los prefijos lógicos de
# Supabase (attachments/, logos/, avatars/…) quedan igual dentro del contenedor.
# - Nombre de la cuenta: minúsculas y números del `name` del bucket, máx. 24 (cloud_options.account_names lo pisa:
#   clave del bucket → nombre). Debe ser único en Azure.
# - Sin claves compartidas: solo Entra ID (la API firma SAS de delegación de usuario con su identidad: rol Storage Blob
#   Delegator para los writers). Terraform crea el contenedor por el plano de datos con Entra
#   (storage_use_azuread = true en el proveedor).
# - public_read: el contenedor admite lectura anónima de blobs (container_access_type = blob) y Front Door lo sirve en
#   files.<dominio> con caché; la escritura sigue siendo solo con SAS.
# - Borrado suave de blobs = soft_delete_days; versionado; ciclo de vida por prefijo; CORS para el origen de la web.
# - force_destroy se ignora (Azure borra la cuenta con su contenido).
# cloud_options: account_names (map), replication ("LRS" en pruebas, "ZRS" en producción).
# context.cloud: resource_group_name.

locals {
  rg          = var.context.cloud["resource_group_name"]
  replication = try(var.cloud_options.replication, var.context.environment == "produccion" ? "ZRS" : "LRS")
  container   = "objetos"

  account_names = {
    for k, b in var.buckets : k => try(var.cloud_options.account_names[k], substr(replace(b.name, "/[^a-z0-9]/", ""), 0, 24))
  }

  role_bindings = merge(
    merge([for b, cfg in var.buckets : { for k, p in cfg.writers : "${b}/w/${k}" => { bucket = b, principal = p, role = "Storage Blob Data Contributor" } }]...),
    merge([for b, cfg in var.buckets : { for k, p in cfg.writers : "${b}/d/${k}" => { bucket = b, principal = p, role = "Storage Blob Delegator" } }]...),
    merge([for b, cfg in var.buckets : { for k, p in cfg.readers : "${b}/r/${k}" => { bucket = b, principal = p, role = "Storage Blob Data Reader" } }]...),
  )

  lifecycle_buckets = { for k, b in var.buckets : k => b if length(b.lifecycle) > 0 || b.versioning }
}

resource "azurerm_storage_account" "this" {
  for_each                         = var.buckets
  name                             = local.account_names[each.key]
  resource_group_name              = local.rg
  location                         = var.context.region
  account_kind                     = "StorageV2"
  account_tier                     = "Standard"
  account_replication_type         = local.replication
  access_tier                      = "Hot"
  min_tls_version                  = "TLS1_2"
  https_traffic_only_enabled       = true
  shared_access_key_enabled        = false
  default_to_oauth_authentication  = true
  allow_nested_items_to_be_public  = each.value.public_read
  cross_tenant_replication_enabled = false
  tags                             = merge(var.context.labels, { proposito = each.key })

  blob_properties {
    versioning_enabled = each.value.versioning

    dynamic "delete_retention_policy" {
      for_each = each.value.soft_delete_days > 0 ? [1] : []
      content {
        days = each.value.soft_delete_days
      }
    }

    dynamic "container_delete_retention_policy" {
      for_each = each.value.soft_delete_days > 0 ? [1] : []
      content {
        days = each.value.soft_delete_days
      }
    }

    dynamic "cors_rule" {
      for_each = length(each.value.cors_origins) > 0 ? [1] : []
      content {
        allowed_origins    = each.value.cors_origins
        allowed_methods    = each.value.cors_methods
        allowed_headers    = ["Content-Type", "Content-Disposition", "Cache-Control", "x-ms-blob-type", "x-ms-blob-content-type", "x-ms-meta-*", "x-ms-version", "x-ms-date"] # subidas con SAS (PUT con x-ms-blob-type: BlockBlob)
        exposed_headers    = ["Content-Type", "Content-Disposition", "Cache-Control", "ETag", "x-ms-*"]
        max_age_in_seconds = 3600
      }
    }
  }
}

resource "azurerm_storage_container" "this" {
  for_each              = var.buckets
  name                  = local.container
  storage_account_id    = azurerm_storage_account.this[each.key].id
  container_access_type = each.value.public_read ? "blob" : "private"
}

resource "azurerm_storage_management_policy" "this" {
  for_each           = local.lifecycle_buckets
  storage_account_id = azurerm_storage_account.this[each.key].id

  dynamic "rule" {
    for_each = each.value.lifecycle
    content {
      name    = "borrar-${substr(replace(rule.value.prefix, "/[^a-zA-Z0-9]/", ""), 0, 40)}"
      enabled = true
      filters {
        blob_types   = ["blockBlob"]
        prefix_match = ["${local.container}/${rule.value.prefix}"]
      }
      actions {
        base_blob {
          delete_after_days_since_modification_greater_than = rule.value.age_days
        }
      }
    }
  }

  dynamic "rule" {
    for_each = each.value.versioning ? [1] : []
    content {
      name    = "versiones-viejas"
      enabled = true
      filters {
        blob_types = ["blockBlob"]
      }
      actions {
        version {
          delete_after_days_since_creation = each.value.noncurrent_ttl_days
        }
      }
    }
  }
}

resource "azurerm_role_assignment" "this" {
  for_each             = local.role_bindings
  scope                = azurerm_storage_account.this[each.value.bucket].id
  role_definition_name = each.value.role
  principal_id         = each.value.principal
  principal_type       = "ServicePrincipal"
}
