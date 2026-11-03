# object-storage/aws: un bucket de S3 por propósito. Todos con bloqueo de acceso público, dueño del bucket forzado,
# cifrado SSE-S3 y solo HTTPS. Los públicos (public_read) se sirven por CloudFront con Origin Access Control: el bucket
# sigue privado y solo CloudFront de esta cuenta lo lee (capabilities/edge/aws). writers/readers = ARN de roles.
# soft_delete_days: S3 no tiene borrado suave aparte; con versioning los objetos borrados quedan como versiones no
# actuales noncurrent_ttl_days días. cloud_options: ninguna.

data "aws_caller_identity" "this" {}
data "aws_partition" "this" {}

locals {
  account = data.aws_caller_identity.this.account_id
  p       = data.aws_partition.this.partition
}

resource "aws_s3_bucket" "this" {
  for_each      = var.buckets
  bucket        = each.value.name
  force_destroy = each.value.force_destroy
  tags          = merge(var.context.labels, { proposito = each.key })
}

resource "aws_s3_bucket_ownership_controls" "this" {
  for_each = var.buckets
  bucket   = aws_s3_bucket.this[each.key].id
  rule {
    object_ownership = "BucketOwnerEnforced"
  }
}

resource "aws_s3_bucket_public_access_block" "this" {
  for_each                = var.buckets
  bucket                  = aws_s3_bucket.this[each.key].id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

resource "aws_s3_bucket_server_side_encryption_configuration" "this" {
  for_each = var.buckets
  bucket   = aws_s3_bucket.this[each.key].id
  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
    bucket_key_enabled = true
  }
}

resource "aws_s3_bucket_versioning" "this" {
  for_each = { for k, b in var.buckets : k => b if b.versioning }
  bucket   = aws_s3_bucket.this[each.key].id
  versioning_configuration {
    status = "Enabled"
  }
}

resource "aws_s3_bucket_cors_configuration" "this" {
  for_each = { for k, b in var.buckets : k => b if length(b.cors_origins) > 0 }
  bucket   = aws_s3_bucket.this[each.key].id
  cors_rule {
    allowed_origins = each.value.cors_origins
    allowed_methods = each.value.cors_methods
    allowed_headers = ["Content-Type", "Content-Disposition", "Cache-Control", "Content-Length", "x-amz-*"] # PUT firmado (x-amz-*) con content-type
    expose_headers  = ["ETag"]
    max_age_seconds = 3600
  }
}

resource "aws_s3_bucket_lifecycle_configuration" "this" {
  for_each = var.buckets
  bucket   = aws_s3_bucket.this[each.key].id

  # Subidas a medias (URL firmada que nunca terminó).
  rule {
    id     = "subidas-incompletas"
    status = "Enabled"
    filter {}
    abort_incomplete_multipart_upload {
      days_after_initiation = 1
    }
  }

  dynamic "rule" {
    for_each = each.value.lifecycle
    content {
      id     = "borrar-${replace(trimsuffix(rule.value.prefix, "/"), "/", "-")}"
      status = "Enabled"
      filter {
        prefix = rule.value.prefix
      }
      expiration {
        days = rule.value.age_days
      }
    }
  }

  dynamic "rule" {
    for_each = each.value.versioning ? [1] : []
    content {
      id     = "versiones-viejas"
      status = "Enabled"
      filter {}
      noncurrent_version_expiration {
        noncurrent_days = each.value.noncurrent_ttl_days
      }
    }
  }

  depends_on = [aws_s3_bucket_versioning.this]
}

locals {
  policies = {
    for k, b in var.buckets : k => {
      Version = "2012-10-17"
      Statement = concat(
        [{
          Sid       = "SoloHTTPS"
          Effect    = "Deny"
          Principal = "*"
          Action    = "s3:*"
          Resource  = [aws_s3_bucket.this[k].arn, "${aws_s3_bucket.this[k].arn}/*"]
          Condition = { Bool = { "aws:SecureTransport" = "false" } }
        }],
        length(b.writers) > 0 ? [{
          Sid       = "Escritores"
          Effect    = "Allow"
          Principal = { AWS = values(b.writers) }
          Action    = ["s3:GetObject", "s3:PutObject", "s3:DeleteObject", "s3:ListBucket", "s3:GetObjectVersion", "s3:AbortMultipartUpload"]
          Resource  = [aws_s3_bucket.this[k].arn, "${aws_s3_bucket.this[k].arn}/*"]
        }] : [],
        length(b.readers) > 0 ? [{
          Sid       = "Lectores"
          Effect    = "Allow"
          Principal = { AWS = values(b.readers) }
          Action    = ["s3:GetObject", "s3:ListBucket"]
          Resource  = [aws_s3_bucket.this[k].arn, "${aws_s3_bucket.this[k].arn}/*"]
        }] : [],
        b.public_read ? [{
          Sid       = "CloudFrontOAC"
          Effect    = "Allow"
          Principal = { Service = "cloudfront.amazonaws.com" }
          Action    = "s3:GetObject"
          Resource  = "${aws_s3_bucket.this[k].arn}/*"
          Condition = { StringLike = { "AWS:SourceArn" = "arn:${local.p}:cloudfront::${local.account}:distribution/*" } }
        }] : [],
      )
    }
  }
}

resource "aws_s3_bucket_policy" "this" {
  for_each = var.buckets
  bucket   = aws_s3_bucket.this[each.key].id
  policy   = jsonencode(local.policies[each.key])

  depends_on = [aws_s3_bucket_public_access_block.this]
}
