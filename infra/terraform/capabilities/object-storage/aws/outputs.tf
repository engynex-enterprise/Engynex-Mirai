output "bucket_names" {
  description = "Propósito → nombre del bucket."
  value       = { for k, b in aws_s3_bucket.this : k => b.bucket }
}

output "bucket_ids" {
  description = "Propósito → ARN del bucket."
  value       = { for k, b in aws_s3_bucket.this : k => b.arn }
}

output "public_origin" {
  description = "Handle del primer bucket con public_read para el borde (CloudFront + OAC), o null."
  value = try([for k, b in var.buckets : {
    kind                 = "s3"
    key                  = k
    bucket               = aws_s3_bucket.this[k].bucket
    arn                  = aws_s3_bucket.this[k].arn
    regional_domain_name = aws_s3_bucket.this[k].bucket_regional_domain_name
  } if b.public_read][0], null)
}

output "endpoints" {
  description = "Propósito → URL del bucket (la API firma URL contra esta base)."
  value       = { for k, b in aws_s3_bucket.this : k => "https://${b.bucket}.s3.${var.context.region}.amazonaws.com" }
}
