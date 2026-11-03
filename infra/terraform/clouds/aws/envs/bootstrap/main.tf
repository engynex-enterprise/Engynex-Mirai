# Bootstrap de Mirai en AWS (se aplica una vez, a mano, con un usuario o rol administrador):
# 1. bucket S3 del estado remoto (versionado, cifrado, sin acceso público; bloqueo nativo con use_lockfile);
# 2. repositorios de ECR (capabilities/registry/aws);
# 3. GitHub Actions sin llaves (capabilities/ci-identity/aws) con roles de plan, apply y despliegue por ambiente.
#
# Cuentas: lo recomendado es una cuenta por ambiente (AWS Organizations), como un proyecto por ambiente en GCP.
# Este bootstrap supone UNA cuenta (la de CI/CD y los dos ambientes) para empezar; con varias cuentas, aplica el
# bootstrap en la de CI/CD (estado y ECR) y crea en cada cuenta de ambiente los roles mirai-tf-<amb> y
# mirai-deploy-<amb> (con ci-identity y las mismas políticas), y comparte ECR por readers.
#
# Permisos de apply: tf_apply_policy_arn = AdministratorAccess por defecto (el stack crea VPC, IAM, RDS, CloudFront,
# WAF…). Es amplio a propósito para el primer ambiente; cuando esté estable, cámbialo por una política propia o un
# permissions boundary (docs/infra/cambiar-de-nube.md).

data "aws_caller_identity" "this" {}
data "aws_partition" "this" {}

locals {
  account = data.aws_caller_identity.this.account_id
  p       = data.aws_partition.this.partition
  labels  = { app = "mirai", gestionado-por = "terraform" }

  context = {
    prefix      = "mirai-produccion" # el contexto de las capacidades exige un ambiente; el bootstrap es compartido
    environment = "produccion"
    region      = var.region
    labels      = local.labels
    cloud       = { account_id = local.account }
  }

  envs = ["pruebas", "produccion"]
}

# ── 1. Estado remoto ────────────────────────────────────────────────────────────────────────────────────────────
resource "aws_s3_bucket" "state" {
  bucket = var.state_bucket_name
  tags   = merge(local.labels, { proposito = "terraform-state" })

  lifecycle {
    prevent_destroy = true
  }
}

resource "aws_s3_bucket_public_access_block" "state" {
  bucket                  = aws_s3_bucket.state.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_ownership_controls" "state" {
  bucket = aws_s3_bucket.state.id
  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

resource "aws_s3_bucket_versioning" "state" {
  bucket = aws_s3_bucket.state.id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_server_side_encryption_configuration" "state" {
  bucket = aws_s3_bucket.state.id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
    bucket_key_enabled = true
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "state" {
  bucket = aws_s3_bucket.state.id
  rule {
    id     = "versiones-viejas"
    status = "Enabled"
    filter {}
    noncurrent_version_expiration {
      noncurrent_days           = 90
      newer_noncurrent_versions = 50
    }
  }
  depends_on = [aws_s3_bucket_versioning.state]
}

resource "aws_s3_bucket_policy" "state" {
  bucket = aws_s3_bucket.state.id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Sid       = "SoloHTTPS"
      Effect    = "Deny"
      Principal = "*"
      Action    = "s3:*"
      Resource  = [aws_s3_bucket.state.arn, "${aws_s3_bucket.state.arn}/*"]
      Condition = { Bool = { "aws:SecureTransport" = "false" } }
    }]
  })
  depends_on = [aws_s3_bucket_public_access_block.state]
}

# ── 2. ECR ──────────────────────────────────────────────────────────────────────────────────────────────────────
module "registry" {
  source  = "../../../../capabilities/registry/aws"
  context = local.context
  name    = var.registry_name
  images  = ["web", "api"]
  readers = var.registry_readers
}

# ── 3. GitHub Actions sin llaves ────────────────────────────────────────────────────────────────────────────────
module "ci" {
  source  = "../../../../capabilities/ci-identity/aws"
  context = local.context

  github = {
    owner         = var.github_owner
    repository    = var.github_repository
    repository_id = var.github_repository_id
  }

  roles = {
    "mirai-tf-plan"           = { display_name = "Terraform plan (solo lectura, cualquier rama o PR)" }
    "mirai-tf-pruebas"        = { display_name = "Terraform apply en pruebas", refs = ["refs/heads/pruebas", "refs/heads/main"] }
    "mirai-tf-produccion"     = { display_name = "Terraform apply en producción (entorno de GitHub con revisores)", environments = ["produccion"] }
    "mirai-deploy-pruebas"    = { display_name = "Despliegue en pruebas", refs = ["refs/heads/pruebas"], environments = ["pruebas"] }
    "mirai-deploy-produccion" = { display_name = "Despliegue en producción (entorno de GitHub con revisores)", environments = ["produccion"] }
  }

  cloud_options = var.existing_github_oidc_provider_arn == null ? {} : { existing_provider_arn = var.existing_github_oidc_provider_arn }
}

locals {
  role_names = { for k, arn in module.ci.ids : k => element(split("/", arn), length(split("/", arn)) - 1) }
  repo_arns  = ["arn:${local.p}:ecr:${var.region}:${local.account}:repository/${var.registry_name}/*"]
}

# Plan: lectura de todo + lectura del estado.
resource "aws_iam_role_policy_attachment" "plan_readonly" {
  role       = local.role_names["mirai-tf-plan"]
  policy_arn = "arn:${local.p}:iam::aws:policy/ReadOnlyAccess"
}

resource "aws_iam_role_policy" "plan_state" {
  name = "mirai-estado-lectura"
  role = local.role_names["mirai-tf-plan"]
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["s3:GetObject", "s3:ListBucket"]
      Resource = [aws_s3_bucket.state.arn, "${aws_s3_bucket.state.arn}/*"]
    }]
  })
}

# Apply por ambiente (amplio; ver el comentario del inicio).
resource "aws_iam_role_policy_attachment" "apply" {
  for_each   = toset(local.envs)
  role       = local.role_names["mirai-tf-${each.key}"]
  policy_arn = var.tf_apply_policy_arn
}

# Despliegue: publicar imágenes, registrar revisiones, actualizar servicios y correr el trabajo de migraciones, solo
# sobre los recursos mirai-<ambiente>-*.
resource "aws_iam_role_policy" "deploy" {
  for_each = toset(local.envs)
  name     = "mirai-despliegue"
  role     = local.role_names["mirai-deploy-${each.key}"]
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      { Sid = "EcrLogin", Effect = "Allow", Action = ["ecr:GetAuthorizationToken"], Resource = "*" },
      {
        Sid    = "EcrPush"
        Effect = "Allow"
        Action = [
          "ecr:BatchCheckLayerAvailability", "ecr:BatchGetImage", "ecr:CompleteLayerUpload", "ecr:DescribeImages",
          "ecr:DescribeRepositories", "ecr:GetDownloadUrlForLayer", "ecr:InitiateLayerUpload", "ecr:PutImage",
          "ecr:UploadLayerPart", "ecr:ListImages", "ecr:DescribeImageScanFindings",
        ]
        Resource = local.repo_arns
      },
      {
        Sid    = "EcsLectura"
        Effect = "Allow"
        Action = [
          "ecs:DescribeTaskDefinition", "ecs:RegisterTaskDefinition", "ecs:DescribeServices", "ecs:DescribeTasks",
          "ecs:ListTasks", "ecs:DescribeClusters", "elasticloadbalancing:Describe*", "cloudwatch:GetMetricData",
          "cloudwatch:DescribeAlarms", "logs:GetLogEvents", "logs:FilterLogEvents", "ec2:DescribeSubnets",
          "ec2:DescribeSecurityGroups",
        ]
        Resource = "*"
      },
      {
        Sid      = "EcsDesplegar"
        Effect   = "Allow"
        Action   = ["ecs:UpdateService", "ecs:RunTask", "ecs:TagResource"]
        Resource = "*"
        Condition = {
          ArnLike = { "ecs:cluster" = "arn:${local.p}:ecs:${var.region}:${local.account}:cluster/mirai-${each.key}" }
        }
      },
      {
        Sid      = "PasarRoles"
        Effect   = "Allow"
        Action   = ["iam:PassRole"]
        Resource = "arn:${local.p}:iam::${local.account}:role/mirai-${each.key}-*"
        Condition = {
          StringEquals = { "iam:PassedToService" = "ecs-tasks.amazonaws.com" }
        }
      },
      {
        Sid      = "ImagenDesplegada"
        Effect   = "Allow"
        Action   = ["ssm:GetParameter", "ssm:PutParameter"]
        Resource = "arn:${local.p}:ssm:${var.region}:${local.account}:parameter/mirai-${each.key}-*"
      },
    ]
  })
}
