# Repositorio Docker de Mirai (web, api y realtime) con limpieza automática.
# Las imágenes se escanean bajo demanda en el pipeline (On-Demand Scanning), por eso el escaneo
# automático del repositorio queda heredado del proyecto (apagado si la API de Container Scanning no está activa).

resource "google_artifact_registry_repository" "this" {
  project       = var.project_id
  location      = var.location
  repository_id = var.repository_id
  format        = "DOCKER"
  description   = "Imágenes de Mirai (Terraform)."
  labels        = var.labels

  docker_config {
    immutable_tags = false # la etiqueta "cache-<ambiente>" se reescribe en cada build
  }

  cleanup_policy_dry_run = var.cleanup_dry_run

  cleanup_policies {
    id     = "conservar-recientes"
    action = "KEEP"
    most_recent_versions {
      keep_count = var.keep_recent
    }
  }

  cleanup_policies {
    id     = "conservar-cache"
    action = "KEEP"
    condition {
      tag_state    = "TAGGED"
      tag_prefixes = ["cache-"]
    }
  }

  cleanup_policies {
    id     = "borrar-sin-etiqueta"
    action = "DELETE"
    condition {
      tag_state  = "UNTAGGED"
      older_than = "${var.untagged_ttl_days * 86400}s"
    }
  }

  cleanup_policies {
    id     = "borrar-viejas"
    action = "DELETE"
    condition {
      tag_state  = "TAGGED"
      older_than = "${var.tagged_ttl_days * 86400}s"
    }
  }
}

resource "google_artifact_registry_repository_iam_member" "readers" {
  for_each   = var.readers
  project    = var.project_id
  location   = var.location
  repository = google_artifact_registry_repository.this.name
  role       = "roles/artifactregistry.reader"
  member     = each.value
}

resource "google_artifact_registry_repository_iam_member" "writers" {
  for_each   = var.writers
  project    = var.project_id
  location   = var.location
  repository = google_artifact_registry_repository.this.name
  role       = "roles/artifactregistry.writer"
  member     = each.value
}
