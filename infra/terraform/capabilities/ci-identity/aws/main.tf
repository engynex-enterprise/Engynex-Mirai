# ci-identity/aws: GitHub Actions entra a AWS sin llaves. Proveedor OIDC de IAM para token.actions.githubusercontent.com
# (audiencia sts.amazonaws.com) y un rol por clave de `roles` que solo puede asumir este repositorio, con condición
# sobre `sub`: repo:<dueño>/<repo>:ref:<ref>, :environment:<entorno> y :pull_request (sin refs ni environments =
# cualquier ejecución del repositorio, solo para lectura). IAM no permite condiciones sobre repository_id: se usa el
# nombre. Los permisos de cada rol los pone el bootstrap (clouds/aws/envs/bootstrap).
# cloud_options: existing_provider_arn (string) = reutilizar un proveedor OIDC de GitHub que ya exista en la cuenta
# (solo puede haber uno por URL).

locals {
  repo         = "${var.github.owner}/${var.github.repository}"
  existing     = try(var.cloud_options.existing_provider_arn, null)
  provider_arn = local.existing != null ? local.existing : aws_iam_openid_connect_provider.github[0].arn

  subjects = {
    for k, r in var.roles : k => (
      length(r.refs) + length(r.environments) == 0 && !r.pull_requests ? ["repo:${local.repo}:*"] : concat(
        [for ref in r.refs : "repo:${local.repo}:ref:${ref}"],
        [for e in r.environments : "repo:${local.repo}:environment:${e}"],
        r.pull_requests ? ["repo:${local.repo}:pull_request"] : [],
      )
    )
  }
}

resource "aws_iam_openid_connect_provider" "github" {
  count          = local.existing == null ? 1 : 0
  url            = "https://token.actions.githubusercontent.com"
  client_id_list = ["sts.amazonaws.com"]
  tags           = var.context.labels
}

resource "aws_iam_role" "this" {
  for_each             = var.roles
  name                 = each.key
  description          = each.value.display_name
  max_session_duration = 3600

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect    = "Allow"
      Principal = { Federated = local.provider_arn }
      Action    = "sts:AssumeRoleWithWebIdentity"
      Condition = {
        StringEquals = { "token.actions.githubusercontent.com:aud" = "sts.amazonaws.com" }
        StringLike   = { "token.actions.githubusercontent.com:sub" = local.subjects[each.key] }
      }
    }]
  })

  tags = var.context.labels
}
