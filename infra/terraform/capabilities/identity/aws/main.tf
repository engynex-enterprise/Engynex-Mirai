# identity/aws: un rol de IAM por identidad. En ECS el MISMO rol hace de rol de ejecución (descargar la imagen, leer
# los secretos que inyecta la definición de tarea, escribir registros) y de rol de la tarea (lo que llama la app).
# La clave `scheduler` también confía en scheduler.amazonaws.com (EventBridge Scheduler lanza la tarea del cron).
# Permisos abstractos → IAM: logs/errors (ya en AmazonECSTaskExecutionRolePolicy), metrics (cloudwatch:PutMetricData),
# traces (AWSXRayDaemonWriteAccess), sql (rds-db:connect), ai (Bedrock), idp (Cognito, solo si se usa).
# cloud_options: permissions_boundary (string, null) = ARN de un límite de permisos para todos los roles.

data "aws_partition" "this" {}

locals {
  p = data.aws_partition.this.partition

  # role name: máx. 64 caracteres.
  names = { for k, v in var.identities : k => substr("${var.context.prefix}-${k}", 0, 64) }

  actions = {
    metrics = ["cloudwatch:PutMetricData"]
    sql     = ["rds-db:connect"]
    ai      = ["bedrock:InvokeModel", "bedrock:InvokeModelWithResponseStream", "bedrock:ListFoundationModels", "bedrock:GetFoundationModel"]
    idp     = ["cognito-idp:Admin*", "cognito-idp:ListUsers", "cognito-idp:DescribeUserPool"]
  }

  inline = {
    for k, v in var.identities : k => distinct(flatten([for c in v.capabilities : lookup(local.actions, c, [])]))
  }
}

resource "aws_iam_role" "this" {
  for_each             = var.identities
  name                 = local.names[each.key]
  description          = substr(coalesce(each.value.description, each.value.display_name), 0, 1000)
  permissions_boundary = try(var.cloud_options.permissions_boundary, null)
  max_session_duration = 3600

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Service = each.key == "scheduler" ? ["ecs-tasks.amazonaws.com", "scheduler.amazonaws.com"] : ["ecs-tasks.amazonaws.com"] }
      Action    = "sts:AssumeRole"
      Condition = { StringEquals = { "aws:SourceAccount" = var.context.cloud["account_id"] } }
    }]
  })

  tags = merge(var.context.labels, { identidad = each.key })
}

resource "aws_iam_role_policy_attachment" "execution" {
  for_each   = var.identities
  role       = aws_iam_role.this[each.key].name
  policy_arn = "arn:${local.p}:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy"
}

resource "aws_iam_role_policy_attachment" "xray" {
  for_each   = { for k, v in var.identities : k => v if contains(v.capabilities, "traces") }
  role       = aws_iam_role.this[each.key].name
  policy_arn = "arn:${local.p}:iam::aws:policy/AWSXRayDaemonWriteAccess"
}

resource "aws_iam_role_policy" "capabilities" {
  for_each = { for k, a in local.inline : k => a if length(a) > 0 }
  name     = "mirai-permisos"
  role     = aws_iam_role.this[each.key].id
  policy = jsonencode({
    Version   = "2012-10-17"
    Statement = [{ Effect = "Allow", Action = each.value, Resource = "*" }]
  })
}
