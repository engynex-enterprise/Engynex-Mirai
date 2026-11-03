output "id" {
  description = "ID de la distribución de CloudFront de la app."
  value       = aws_cloudfront_distribution.app.id
}

output "ip_or_cname" {
  description = "Dominio de CloudFront (los dominios del ambiente van como CNAME a este)."
  value       = aws_cloudfront_distribution.app.domain_name
}

output "dns_records" {
  description = "Registros a crear en Hostinger: CNAME de validación del certificado (primero) y CNAME de cada dominio a CloudFront."
  value = concat(
    local.validation_records,
    [for h in local.container_hosts : { name = h, type = "CNAME", data = aws_cloudfront_distribution.app.domain_name }],
    flatten([for b, hs in local.bucket_hosts : [for h in hs : { name = h, type = "CNAME", data = aws_cloudfront_distribution.files[b].domain_name }]]),
  )
}

output "security_policy_id" {
  description = "ARN del web ACL de AWS WAF."
  value       = aws_wafv2_web_acl.this.arn
}
