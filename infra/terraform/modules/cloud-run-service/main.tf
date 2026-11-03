# Servicio de Cloud Run (v2) de Mirai.
# Terraform define la configuración (cuenta, escala, red, variables y secretos) y Cloud Build cambia la imagen y
# el tráfico (despliegue gradual). Por eso se ignoran la imagen, la revisión y el tráfico: un `terraform apply`
# nunca revierte un despliegue. Ojo: un cambio de configuración aplicado por Terraform crea una revisión nueva
# que recibe el 100 % si el tráfico está en "la más reciente" (estado normal tras cada despliegue).

resource "google_cloud_run_v2_service" "this" {
  project             = var.project_id
  name                = var.name
  location            = var.region
  description         = var.description
  labels              = var.labels
  ingress             = var.ingress
  deletion_protection = var.deletion_protection

  # Público sin "allUsers": compatible con la política de organización iam.allowedPolicyMemberDomains.
  invoker_iam_disabled = var.public

  template {
    labels                           = var.labels
    service_account                  = var.service_account_email
    timeout                          = "${var.timeout_seconds}s"
    max_instance_request_concurrency = var.concurrency
    session_affinity                 = var.session_affinity
    execution_environment            = "EXECUTION_ENVIRONMENT_GEN2"

    scaling {
      min_instance_count = var.min_instances
      max_instance_count = var.max_instances
    }

    dynamic "vpc_access" {
      for_each = var.vpc == null ? [] : [var.vpc]
      content {
        egress = vpc_access.value.egress
        network_interfaces {
          network    = vpc_access.value.network
          subnetwork = vpc_access.value.subnetwork
          tags       = vpc_access.value.tags
        }
      }
    }

    containers {
      image = var.image

      ports {
        container_port = var.container_port
      }

      resources {
        limits = {
          cpu    = var.cpu
          memory = var.memory
        }
        cpu_idle          = var.cpu_idle
        startup_cpu_boost = var.startup_cpu_boost
      }

      dynamic "env" {
        for_each = var.env
        content {
          name  = env.key
          value = env.value
        }
      }

      dynamic "env" {
        for_each = var.secret_env
        content {
          name = env.key
          value_source {
            secret_key_ref {
              secret  = env.value.secret
              version = env.value.version
            }
          }
        }
      }

      startup_probe {
        initial_delay_seconds = var.startup_probe.initial_delay
        period_seconds        = var.startup_probe.period
        timeout_seconds       = var.startup_probe.timeout
        failure_threshold     = var.startup_probe.failure_threshold

        dynamic "tcp_socket" {
          for_each = var.startup_probe.type == "tcp" ? [1] : []
          content {
            port = var.container_port
          }
        }

        dynamic "http_get" {
          for_each = var.startup_probe.type == "http" ? [1] : []
          content {
            path = var.startup_probe.path
            port = var.container_port
          }
        }
      }

      dynamic "liveness_probe" {
        for_each = var.liveness_path == null ? [] : [var.liveness_path]
        content {
          period_seconds    = 30
          timeout_seconds   = 5
          failure_threshold = 3
          http_get {
            path = liveness_probe.value
            port = var.container_port
          }
        }
      }
    }
  }

  traffic {
    type    = "TRAFFIC_TARGET_ALLOCATION_TYPE_LATEST"
    percent = 100
  }

  lifecycle {
    ignore_changes = [
      client,
      client_version,
      template[0].revision,
      template[0].containers[0].image,
      traffic,
    ]
  }
}

resource "google_cloud_run_v2_service_iam_member" "invokers" {
  for_each = var.invoker_members
  project  = var.project_id
  location = var.region
  name     = google_cloud_run_v2_service.this.name
  role     = "roles/run.invoker"
  member   = each.value
}
