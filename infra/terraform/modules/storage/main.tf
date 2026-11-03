# Cloud Storage de Mirai (reemplaza los 7 buckets de Supabase Storage en la etapa 2).
# - private: adjuntos del contador ({book_id}/…), facturas, opiniones, logos. Acceso solo con URL firmada V4
#   que emite la API después de revisar la membresía del libro (FilesModule).
# - backups: respaldos de libros y exportaciones (versionado; exportaciones se borran solas).
# - public: avatares, anuncios y public-assets (imagen de WhatsApp), detrás de Cloud CDN.

locals {
  admin_bindings = merge([
    for b, cfg in var.buckets : { for k, m in cfg.object_admins : "${b}/${k}" => { bucket = b, member = m } }
  ]...)
  viewer_bindings = merge([
    for b, cfg in var.buckets : { for k, m in cfg.object_viewers : "${b}/${k}" => { bucket = b, member = m } }
  ]...)
}

resource "google_storage_bucket" "this" {
  for_each                    = var.buckets
  project                     = var.project_id
  name                        = each.value.name
  location                    = var.location
  storage_class               = "STANDARD"
  uniform_bucket_level_access = true
  public_access_prevention    = each.value.public_read ? "inherited" : "enforced"
  force_destroy               = each.value.force_destroy
  labels                      = merge(var.labels, { proposito = each.key })

  versioning {
    enabled = each.value.versioning
  }

  soft_delete_policy {
    retention_duration_seconds = each.value.soft_delete_days * 86400
  }

  dynamic "cors" {
    for_each = length(each.value.cors_origins) > 0 ? [1] : []
    content {
      origin          = each.value.cors_origins
      method          = each.value.cors_methods
      response_header = ["Content-Type", "Content-Disposition", "Cache-Control", "x-goog-meta-*", "x-goog-content-length-range"]
      max_age_seconds = 3600
    }
  }

  dynamic "lifecycle_rule" {
    for_each = each.value.lifecycle
    content {
      action {
        type          = lifecycle_rule.value.action
        storage_class = lifecycle_rule.value.storage_class
      }
      condition {
        age            = lifecycle_rule.value.age_days
        matches_prefix = [lifecycle_rule.value.prefix]
      }
    }
  }

  dynamic "lifecycle_rule" {
    for_each = each.value.versioning ? [1] : []
    content {
      action {
        type = "Delete"
      }
      condition {
        with_state                 = "ARCHIVED"
        days_since_noncurrent_time = each.value.noncurrent_ttl_days
      }
    }
  }

  # Subidas a medias (URL firmada que nunca terminó).
  lifecycle_rule {
    action {
      type = "AbortIncompleteMultipartUpload"
    }
    condition {
      age = 1
    }
  }
}

resource "google_storage_bucket_iam_member" "public_read" {
  for_each = { for k, b in var.buckets : k => b if b.public_read }
  bucket   = google_storage_bucket.this[each.key].name
  role     = "roles/storage.objectViewer"
  member   = "allUsers"
}

resource "google_storage_bucket_iam_member" "admins" {
  for_each = local.admin_bindings
  bucket   = google_storage_bucket.this[each.value.bucket].name
  role     = "roles/storage.objectAdmin"
  member   = each.value.member
}

resource "google_storage_bucket_iam_member" "viewers" {
  for_each = local.viewer_bindings
  bucket   = google_storage_bucket.this[each.value.bucket].name
  role     = "roles/storage.objectViewer"
  member   = each.value.member
}
