# registry/aws: un repositorio de ECR por imagen (<name>/web, <name>/api…), escaneo al subir, etiquetas mutables
# (cache-<ambiente> se reescribe), cifrado y limpieza automática. Vive en la cuenta de CI/CD (bootstrap).
# Limpieza: ECR no combina "conservar N recientes" con "borrar las etiquetadas de más de X días" en la misma imagen,
# así que se aplican sin etiqueta → untagged_ttl_days y "más de keep_recent versiones" → se borran las viejas.
# tagged_ttl_days y cleanup_dry_run se ignoran. readers/writers = ARN de roles o cuentas.

data "aws_caller_identity" "this" {}

resource "aws_ecr_repository" "this" {
  for_each             = toset(var.images)
  name                 = "${var.name}/${each.key}"
  image_tag_mutability = "MUTABLE"
  force_delete         = false
  tags                 = merge(var.context.labels, { imagen = each.key })

  image_scanning_configuration {
    scan_on_push = true
  }

  encryption_configuration {
    encryption_type = "AES256"
  }
}

resource "aws_ecr_lifecycle_policy" "this" {
  for_each   = aws_ecr_repository.this
  repository = each.value.name
  policy = jsonencode({
    rules = [
      {
        rulePriority = 1
        description  = "Borrar imágenes sin etiqueta"
        selection    = { tagStatus = "untagged", countType = "sinceImagePushed", countUnit = "days", countNumber = var.untagged_ttl_days }
        action       = { type = "expire" }
      },
      {
        rulePriority = 2
        description  = "Conservar las ${var.keep_recent} más recientes"
        selection    = { tagStatus = "any", countType = "imageCountMoreThan", countNumber = var.keep_recent }
        action       = { type = "expire" }
      },
    ]
  })
}

resource "aws_ecr_repository_policy" "this" {
  for_each   = length(var.readers) + length(var.writers) > 0 ? aws_ecr_repository.this : {}
  repository = each.value.name
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = concat(
      length(var.readers) + length(var.writers) > 0 ? [{
        Sid       = "Leer"
        Effect    = "Allow"
        Principal = { AWS = distinct(concat(values(var.readers), values(var.writers))) }
        Action    = ["ecr:BatchGetImage", "ecr:GetDownloadUrlForLayer", "ecr:BatchCheckLayerAvailability", "ecr:DescribeImages"]
      }] : [],
      length(var.writers) > 0 ? [{
        Sid       = "Escribir"
        Effect    = "Allow"
        Principal = { AWS = values(var.writers) }
        Action    = ["ecr:PutImage", "ecr:InitiateLayerUpload", "ecr:UploadLayerPart", "ecr:CompleteLayerUpload", "ecr:BatchDeleteImage"]
      }] : [],
    )
  })
}
