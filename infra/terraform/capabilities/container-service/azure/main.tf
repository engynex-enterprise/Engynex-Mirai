# Servicio HTTP en Azure Container Apps.
# - Modo de revisiones Multiple (canario: el CI/CD crea una revisión sin tráfico, le pone la etiqueta "canary" y mueve
#   el tráfico, infra/deploy/azure/desplegar.sh). Con session_affinity el modo es Single: Azure solo admite sesiones
#   pegajosas en modo de una revisión, y se encienden con azapi (azurerm aún no expone stickySessions).
# - CPU y memoria: el perfil Consumption exige memoria = 2 × CPU, así que `memory` se ignora y se usa 0.25→0.5Gi,
#   0.5→1Gi, 1→2Gi, 2→4Gi, 4→8Gi.
# - Escala: min/max réplicas y regla HTTP con `concurrency` peticiones simultáneas por réplica. always_on_cpu se
#   ignora (en Consumption la réplica tiene la CPU mientras existe; min_instances ≥ 1 la mantiene viva).
# - ingress: edge/public → externo (FQDN <app>.<dominio>; Front Door delante); internal → solo dentro del entorno
#   (<app>.internal.<dominio>). routes e invokers se ignoran: el borde (edge) hace las rutas y el acceso es por red.
# - timeout_s: Container Apps corta a los 240 s por petición y Front Door también (máx. 240 s): el chat en streaming
#   debe mandar datos antes de ese tiempo.
# - Secretos: referencias a Key Vault leídas con la identidad del servicio (rol Key Vault Secrets User).
# - La imagen, el sufijo de revisión y el tráfico los cambia el CI/CD: Terraform los ignora.
# - deletion_protection = candado CanNotDelete sobre la app.
# cloud_options:
#   registry_server (string) → ACR de donde baja la imagen con la identidad (rol AcrPull, lo da el stack).
#   no_ingress      (bool, false) → sin ingress ni sondas HTTP (worker que no escucha).
#   revision_mode   (string) → pisa Multiple/Single.
#   labels          (map) → etiquetas extra.
#   otel_collector  ({ image, config }) → colector OpenTelemetry como segundo contenedor (0,25 vCPU / 0,5 Gi; config =
#                   YAML de infra/otel/collector.azure.yaml en OTELCOL_CONFIG, --config=env:OTELCOL_CONFIG; env = variables extra).
# context.cloud: resource_group_name.

locals {
  rg              = var.context.cloud["resource_group_name"]
  registry_server = try(var.cloud_options.registry_server, null)
  no_ingress      = try(var.cloud_options.no_ingress, false)
  revision_mode   = try(var.cloud_options.revision_mode, var.session_affinity ? "Single" : "Multiple")

  cpu    = tonumber(var.cpu)
  memory = "${local.cpu * 2}Gi"
  image  = coalesce(var.image, "mcr.microsoft.com/k8se/quickstart:latest")

  # Nombre del secreto dentro de la app: minúsculas, números y guiones.
  secret_names = { for env, ref in var.secret_env : env => lower(replace(env, "_", "-")) }

  health_http = var.health_path != null
}

resource "azurerm_container_app" "this" {
  name                         = var.name
  resource_group_name          = local.rg
  container_app_environment_id = var.platform.id
  revision_mode                = local.revision_mode
  workload_profile_name        = "Consumption"
  max_inactive_revisions       = 10
  tags                         = merge(var.context.labels, try(var.cloud_options.labels, {}), { descripcion = substr(var.description, 0, 250) })

  identity {
    type         = "UserAssigned"
    identity_ids = [var.identity.id]
  }

  dynamic "registry" {
    for_each = local.registry_server == null ? [] : [local.registry_server]
    content {
      server   = registry.value
      identity = var.identity.id
    }
  }

  dynamic "secret" {
    for_each = var.secret_env
    content {
      name                = local.secret_names[secret.key]
      key_vault_secret_id = secret.value
      identity            = var.identity.id
    }
  }

  dynamic "ingress" {
    for_each = local.no_ingress ? [] : [1]
    content {
      external_enabled           = var.ingress != "internal"
      target_port                = var.port
      transport                  = "auto" # HTTP/1.1, HTTP/2 y WebSocket
      allow_insecure_connections = false

      traffic_weight {
        latest_revision = true
        percentage      = 100
      }
    }
  }

  template {
    min_replicas                     = var.min_instances
    max_replicas                     = var.max_instances
    termination_grace_period_seconds = 30

    dynamic "http_scale_rule" {
      for_each = local.no_ingress ? [] : [1]
      content {
        name                = "http"
        concurrent_requests = tostring(var.concurrency)
      }
    }

    container {
      name    = "app"
      image   = local.image
      cpu     = local.cpu
      memory  = local.memory
      command = var.command
      args    = var.args

      env {
        name  = "PORT"
        value = tostring(var.port)
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
          name        = env.key
          secret_name = local.secret_names[env.key]
        }
      }

      dynamic "startup_probe" {
        for_each = local.no_ingress ? [] : [1]
        content {
          transport               = var.probes.startup == "http" && local.health_http ? "HTTP" : "TCP"
          path                    = var.probes.startup == "http" && local.health_http ? var.health_path : null
          port                    = var.port
          interval_seconds        = 5
          timeout                 = 3
          failure_count_threshold = 24
        }
      }

      dynamic "liveness_probe" {
        for_each = !local.no_ingress && var.probes.liveness && local.health_http ? [1] : []
        content {
          transport               = "HTTP"
          path                    = var.health_path
          port                    = var.port
          interval_seconds        = 30
          timeout                 = 5
          failure_count_threshold = 3
        }
      }

      dynamic "readiness_probe" {
        for_each = local.no_ingress ? [] : [1]
        content {
          transport               = local.health_http ? "HTTP" : "TCP"
          path                    = local.health_http ? var.health_path : null
          port                    = var.port
          interval_seconds        = 10
          timeout                 = 5
          failure_count_threshold = 3
        }
      }
    }

    dynamic "container" {
      for_each = try(var.cloud_options.otel_collector, null) == null ? [] : [var.cloud_options.otel_collector]
      content {
        name   = "otel"
        image  = container.value.image
        cpu    = 0.25
        memory = "0.5Gi"
        args   = ["--config=env:OTELCOL_CONFIG"]

        dynamic "env" {
          for_each = merge(try(container.value.env, {}), { OTELCOL_CONFIG = container.value.config })
          content {
            name  = env.key
            value = env.value
          }
        }
      }
    }
  }

  lifecycle {
    ignore_changes = [
      template[0].container[0].image,
      template[0].revision_suffix,
      ingress[0].traffic_weight,
    ]
  }
}

# Sesiones pegajosas (socket.io con long-polling). azurerm no las expone: se ponen con azapi y se vuelven a aplicar
# cada vez que Terraform cambia la app (un PUT de azurerm las borraría).
resource "azapi_update_resource" "sticky" {
  count       = var.session_affinity && !local.no_ingress ? 1 : 0
  type        = "Microsoft.App/containerApps@2024-03-01"
  resource_id = azurerm_container_app.this.id

  body = {
    properties = {
      configuration = {
        ingress = {
          stickySessions = { affinity = "sticky" }
        }
      }
    }
  }

  lifecycle {
    replace_triggered_by = [azurerm_container_app.this]
  }
}

resource "azurerm_management_lock" "this" {
  count      = var.deletion_protection ? 1 : 0
  name       = "${var.name}-no-borrar"
  scope      = azurerm_container_app.this.id
  lock_level = "CanNotDelete"
  notes      = "Protección contra borrado (Terraform: deletion_protection)."
}
