# Cron de Mirai en Azure: un Container Apps Job por trabajo con disparador por horario. Cada ejecución corre curl y
# hace POST a <target.base_url><path> con Authorization: Bearer $CRON_SECRET (SchedulerGuard lo acepta); el secreto
# sale de Key Vault con la identidad del handle `identity`.
# - Horario: Container Apps Jobs solo entiende cron en UTC. Se convierte la hora desde time_zone (America/Bogota =
#   UTC-5, sin horario de verano): "5 * * * *" y "*/5 * * * *" quedan igual; "0 6 * * *" pasa a "0 11 * * *". Solo se
#   convierten horas sueltas o listas (6,9); si al sumar se pasa de medianoche con día del mes o de la semana fijos,
#   falla la precondición. Otra zona: cloud_options.utc_offset_hours (número que se suma a la hora local).
# - Pausa: los jobs no tienen "pausado"; con paused (global o por trabajo) se programan para el 31 de febrero
#   ("0 0 31 2 *"), que nunca llega. Se reanudan quitando la pausa y aplicando.
# - Reintentos: retry_count → replica_retry_limit; deadline_s → replica_timeout_in_seconds y --max-time de curl.
# cloud_options: image (curl fijo), utc_offset_hours.
# context.cloud: resource_group_name.

locals {
  rg     = var.context.cloud["resource_group_name"]
  image  = try(var.cloud_options.image, "docker.io/curlimages/curl:8.11.1")
  offset = try(var.cloud_options.utc_offset_hours, contains(["UTC", "Etc/UTC"], var.time_zone) ? 0 : (var.time_zone == "America/Bogota" ? 5 : null))

  never = "0 0 31 2 *"

  crons = {
    for k, j in var.jobs : k => {
      fields = split(" ", j.schedule)
      hour   = split(" ", j.schedule)[1]
      fixed  = !(split(" ", j.schedule)[1] == "*" || startswith(split(" ", j.schedule)[1], "*/"))
    }
  }

  utc = {
    for k, c in local.crons : k => (
      c.fixed
      ? join(" ", concat([c.fields[0], join(",", [for h in split(",", c.hour) : tostring((tonumber(h) + local.offset) % 24)])], slice(c.fields, 2, 5)))
      : var.jobs[k].schedule
    )
  }

  # true si alguna hora cruza la medianoche al pasar a UTC y el día está fijo (no se puede convertir solo la hora).
  crosses_midnight = {
    for k, c in local.crons : k => c.fixed && anytrue([for h in split(",", c.hour) : tonumber(h) + local.offset >= 24]) && (c.fields[2] != "*" || c.fields[4] != "*")
  }

  # Nombre del job: máx. 32 caracteres.
  names = { for k in keys(var.jobs) : k => trimsuffix(substr("${var.context.prefix}-${k}", 0, 32), "-") }

  host_header = var.target.host_header == null ? "" : " -H \"Host: ${var.target.host_header}\""
}

resource "azurerm_container_app_job" "this" {
  for_each                     = var.jobs
  name                         = local.names[each.key]
  resource_group_name          = local.rg
  location                     = var.context.region
  container_app_environment_id = var.platform.id
  workload_profile_name        = "Consumption"
  replica_timeout_in_seconds   = each.value.deadline_s
  replica_retry_limit          = each.value.retry_count
  tags                         = merge(var.context.labels, { trabajo = each.key, descripcion = substr(each.value.description, 0, 250) })

  identity {
    type         = "UserAssigned"
    identity_ids = [var.identity.id]
  }

  schedule_trigger_config {
    cron_expression          = var.paused || each.value.paused ? local.never : local.utc[each.key]
    parallelism              = 1
    replica_completion_count = 1
  }

  dynamic "secret" {
    for_each = var.secret_ref == null ? [] : [var.secret_ref]
    content {
      name                = "cron-secret"
      key_vault_secret_id = secret.value
      identity            = var.identity.id
    }
  }

  template {
    container {
      name    = "curl"
      image   = local.image
      cpu     = 0.25
      memory  = "0.5Gi"
      command = ["/bin/sh", "-c"]
      args = [
        "curl --fail-with-body -sS --max-time ${each.value.deadline_s} -X POST -H \"Authorization: Bearer $CRON_SECRET\" -H \"Content-Type: application/json\" -H \"User-Agent: mirai-scheduler\"${local.host_header} --data \"$BODY\" \"$URL\"",
      ]

      dynamic "env" {
        for_each = var.secret_ref == null ? [] : [1]
        content {
          name        = "CRON_SECRET"
          secret_name = "cron-secret"
        }
      }
      env {
        name  = "URL"
        value = "${trimsuffix(var.target.base_url, "/")}${each.value.path}"
      }
      env {
        name  = "BODY"
        value = each.value.body
      }
    }
  }

  lifecycle {
    precondition {
      condition     = local.offset != null
      error_message = "Zona horaria sin conversión a UTC: usa America/Bogota, UTC o cloud_options.utc_offset_hours."
    }
    precondition {
      condition     = !local.crosses_midnight[each.key]
      error_message = "El horario de ${each.key} cruza la medianoche al pasar a UTC con día fijo: escríbelo en UTC con time_zone = \"UTC\"."
    }
  }
}
