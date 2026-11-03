# secrets/aws: Secrets Manager, un secreto por clave (<prefix>/<clave>). Terraform crea el contenedor y los permisos;
# los valores se cargan con `aws secretsmanager put-secret-value` (docs/infra/runbook.md) salvo generated_values.
# Permisos: cada accessor es el ARN de un rol (identity/aws); se le agrega una política en línea con GetSecretValue
# sobre sus secretos. En ECS el rol de ejecución es el mismo de la tarea, así que eso alcanza para inyectarlos.
# cloud_options: recovery_window_days (number, 7; 0 = borrado inmediato, útil en pruebas).

locals {
  opts = var.cloud_options

  # Clave fija del accessor (api, web…) → ARN del rol y secretos que lee. Se agrupa por la CLAVE (conocida al planear),
  # no por el ARN (se conoce después de crear el rol). El nombre del rol es lo que va después de la última "/".
  accessor_keys = distinct(flatten([for k, s in var.secrets : keys(s.accessors)]))
  by_accessor = {
    for a in local.accessor_keys : a => {
      arn     = [for k, s in var.secrets : s.accessors[a] if contains(keys(s.accessors), a)][0]
      secrets = [for k, s in var.secrets : k if contains(keys(s.accessors), a)]
    }
  }
}

resource "aws_secretsmanager_secret" "this" {
  for_each                = var.secrets
  name                    = "${var.context.prefix}/${each.key}"
  description             = substr(each.value.description, 0, 2048)
  recovery_window_in_days = try(local.opts.recovery_window_days, 7)
  tags                    = merge(var.context.labels, each.value.labels, { secreto = each.key })
}

resource "aws_secretsmanager_secret_version" "generated" {
  for_each      = nonsensitive(toset(keys(var.generated_values)))
  secret_id     = aws_secretsmanager_secret.this[each.key].id
  secret_string = var.generated_values[each.key]
}

resource "aws_iam_role_policy" "read" {
  for_each = local.by_accessor
  name     = "mirai-secretos"
  role     = element(split("/", each.value.arn), length(split("/", each.value.arn)) - 1)
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["secretsmanager:GetSecretValue", "secretsmanager:DescribeSecret"]
      Resource = [for k in each.value.secrets : aws_secretsmanager_secret.this[k].arn]
    }]
  })
}
