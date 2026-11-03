# edge/aws: borde público con CloudFront + AWS WAF + certificado de ACM (los tres en us-east-1, alias aws.us_east_1).
#
# Decisión: dos tipos de distribución, porque los comportamientos de CloudFront eligen por CAMINO, no por dominio:
#   - "app": TODOS los dominios de contenedores (web, api, rt, canarios si hubiera) → un VPC origin hacia el ALB INTERNO
#     de container-platform. CloudFront reenvía el Host (política AllViewer) y el ALB elige el servicio por dominio y
#     camino (reglas que crea cada container-service con sus `routes`). Así el mismo origen (/v1/*, /api/auth/*,
#     /socket.io/*) funciona igual que en GCP y Azure, y el ALB no tiene IP pública.
#   - "files-<clave>": una por bucket público (bucket_origins) → S3 con Origin Access Control.
# Caché: por defecto NADA (CachingDisabled: páginas con sesión, /sw.js, /api/public/version); /_next/static/* con
# CachingOptimized (respeta el immutable de Next); /socket.io/* sin caché (CloudFront pasa WebSocket solo).
# WAF (alcance CLOUDFRONT): listas de IP, webhooks de pagos con límite por IP y SIN reglas administradas (la firma da la
# autenticidad), reglas administradas (Common, KnownBadInputs, SQLi) en modo "count" mientras waf_preview, límite para
# IA/chat y límite general. waf_sensitivity y adaptive_protection (Shield Advanced) no tienen equivalente directo.
# Certificado: un ACM con certificate_domains validado por DNS; dns_records trae los CNAME de validación (créalos en
# Hostinger ANTES: el apply espera hasta 2 h a que el certificado quede emitido) y los CNAME de cada dominio a CloudFront.
# dns_authorization_domains y log_sample_rate se ignoran (los registros de acceso de CloudFront se activan aparte).
#
# cloud_options: price_class (string, "PriceClass_All": Suramérica solo está en All), origin_read_timeout_s (60),
# wait_for_certificate (bool, true).

locals {
  opts = var.cloud_options

  # Ids fijos de las políticas administradas de CloudFront (documentados por AWS, iguales en todas las cuentas).
  cache_disabled  = "4135ea2d-6df8-44a3-9df3-4b5a84be39ad" # Managed-CachingDisabled
  cache_optimized = "658327ea-f89d-4fab-a63d-7e88639e58f6" # Managed-CachingOptimized
  all_viewer      = "216adef6-5c7f-47e4-b989-5492eafa07d3" # Managed-AllViewer (incluye Host)

  container_hosts = sort([for h, o in var.hosts : h if contains(keys(var.origins), o)])
  bucket_hosts    = { for b in keys(var.bucket_origins) : b => sort([for h, o in var.hosts : h if o == b]) }

  first_origin = values(var.origins)[0].origin
  wait_cert    = try(local.opts.wait_for_certificate, true)
  cert_arn     = local.wait_cert ? aws_acm_certificate_validation.this[0].certificate_arn : aws_acm_certificate.this.arn

  # Caminos de las rutas del mismo origen: cada uno con su comportamiento sin caché (además de /socket.io/*).
  no_cache_paths = distinct(concat(flatten([for r in var.routes : r.paths]), ["/socket.io/*"]))

  deny_v4  = [for c in var.waf.deny_ip_ranges : c if !strcontains(c, ":")]
  allow_v4 = [for c in var.waf.allow_ip_ranges : c if !strcontains(c, ":")]
  managed  = ["AWSManagedRulesCommonRuleSet", "AWSManagedRulesKnownBadInputsRuleSet", "AWSManagedRulesSQLiRuleSet"]
}

# ── Certificado ─────────────────────────────────────────────────────────────────────────────────────────────────
resource "aws_acm_certificate" "this" {
  provider                  = aws.us_east_1
  domain_name               = var.certificate_domains[0]
  subject_alternative_names = slice(var.certificate_domains, 1, length(var.certificate_domains))
  validation_method         = "DNS"
  key_algorithm             = "RSA_2048"
  tags                      = var.context.labels

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_acm_certificate_validation" "this" {
  count           = local.wait_cert ? 1 : 0
  provider        = aws.us_east_1
  certificate_arn = aws_acm_certificate.this.arn

  timeouts {
    create = "2h"
  }
}

# ── WAF ─────────────────────────────────────────────────────────────────────────────────────────────────────────
resource "aws_wafv2_ip_set" "deny" {
  count              = length(local.deny_v4) > 0 ? 1 : 0
  provider           = aws.us_east_1
  name               = "${var.name}-bloqueadas"
  scope              = "CLOUDFRONT"
  ip_address_version = "IPV4"
  addresses          = local.deny_v4
  tags               = var.context.labels
}

resource "aws_wafv2_ip_set" "allow" {
  count              = length(local.allow_v4) > 0 ? 1 : 0
  provider           = aws.us_east_1
  name               = "${var.name}-confianza"
  scope              = "CLOUDFRONT"
  ip_address_version = "IPV4"
  addresses          = local.allow_v4
  tags               = var.context.labels
}

resource "aws_wafv2_web_acl" "this" {
  provider    = aws.us_east_1
  name        = "${var.name}-waf"
  description = "WAF y límites de Mirai (${var.name})."
  scope       = "CLOUDFRONT"
  tags        = var.context.labels

  default_action {
    allow {}
  }

  visibility_config {
    cloudwatch_metrics_enabled = true
    metric_name                = "${var.name}-waf"
    sampled_requests_enabled   = true
  }

  dynamic "rule" {
    for_each = length(local.deny_v4) > 0 ? [1] : []
    content {
      name     = "ip-bloqueadas"
      priority = 1
      action {
        block {}
      }
      statement {
        ip_set_reference_statement {
          arn = aws_wafv2_ip_set.deny[0].arn
        }
      }
      visibility_config {
        cloudwatch_metrics_enabled = true
        metric_name                = "ip-bloqueadas"
        sampled_requests_enabled   = true
      }
    }
  }

  dynamic "rule" {
    for_each = length(local.allow_v4) > 0 ? [1] : []
    content {
      name     = "ip-confianza"
      priority = 2
      action {
        allow {}
      }
      statement {
        ip_set_reference_statement {
          arn = aws_wafv2_ip_set.allow[0].arn
        }
      }
      visibility_config {
        cloudwatch_metrics_enabled = true
        metric_name                = "ip-confianza"
        sampled_requests_enabled   = true
      }
    }
  }

  # Webhooks de Mercado Pago y Wompi: límite por IP (bloquea solo si se pasa)…
  rule {
    name     = "webhooks-limite"
    priority = 10
    action {
      block {}
    }
    statement {
      rate_based_statement {
        limit                 = max(10, var.waf.webhook_rate_limit_per_minute)
        evaluation_window_sec = 60
        aggregate_key_type    = "IP"
        scope_down_statement {
          or_statement {
            statement {
              byte_match_statement {
                positional_constraint = "STARTS_WITH"
                search_string         = "/v1/webhooks/"
                field_to_match {
                  uri_path {}
                }
                text_transformation {
                  priority = 0
                  type     = "NONE"
                }
              }
            }
            statement {
              byte_match_statement {
                positional_constraint = "STARTS_WITH"
                search_string         = "/api/pagos/"
                field_to_match {
                  uri_path {}
                }
                text_transformation {
                  priority = 0
                  type     = "NONE"
                }
              }
            }
          }
        }
      }
    }
    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "webhooks-limite"
      sampled_requests_enabled   = true
    }
  }

  # …y si cumplen, pasan sin las reglas administradas (un JSON legítimo podría parecer un ataque).
  rule {
    name     = "webhooks-sin-waf"
    priority = 11
    action {
      allow {}
    }
    statement {
      or_statement {
        statement {
          byte_match_statement {
            positional_constraint = "STARTS_WITH"
            search_string         = "/v1/webhooks/"
            field_to_match {
              uri_path {}
            }
            text_transformation {
              priority = 0
              type     = "NONE"
            }
          }
        }
        statement {
          byte_match_statement {
            positional_constraint = "STARTS_WITH"
            search_string         = "/api/pagos/"
            field_to_match {
              uri_path {}
            }
            text_transformation {
              priority = 0
              type     = "NONE"
            }
          }
        }
      }
    }
    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "webhooks-sin-waf"
      sampled_requests_enabled   = true
    }
  }

  dynamic "rule" {
    for_each = { for i, g in local.managed : g => 20 + i }
    content {
      name     = rule.key
      priority = rule.value
      override_action {
        dynamic "count" {
          for_each = var.waf.waf_preview ? [1] : []
          content {}
        }
        dynamic "none" {
          for_each = var.waf.waf_preview ? [] : [1]
          content {}
        }
      }
      statement {
        managed_rule_group_statement {
          vendor_name = "AWS"
          name        = rule.key
        }
      }
      visibility_config {
        cloudwatch_metrics_enabled = true
        metric_name                = rule.key
        sampled_requests_enabled   = true
      }
    }
  }

  # IA y chat: cuestan dinero por petición (la API además limita por hogar).
  rule {
    name     = "ia-chat-limite"
    priority = 40
    action {
      block {}
    }
    statement {
      rate_based_statement {
        limit                 = max(10, var.waf.sensitive_rate_limit_per_minute)
        evaluation_window_sec = 60
        aggregate_key_type    = "IP"
        scope_down_statement {
          or_statement {
            statement {
              regex_match_statement {
                regex_string = "^/v1/books/[^/]+/(ai|chat)/"
                field_to_match {
                  uri_path {}
                }
                text_transformation {
                  priority = 0
                  type     = "NONE"
                }
              }
            }
            statement {
              byte_match_statement {
                positional_constraint = "STARTS_WITH"
                search_string         = "/api/chat"
                field_to_match {
                  uri_path {}
                }
                text_transformation {
                  priority = 0
                  type     = "NONE"
                }
              }
            }
          }
        }
      }
    }
    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "ia-chat-limite"
      sampled_requests_enabled   = true
    }
  }

  rule {
    name     = "limite-general"
    priority = 50
    action {
      block {}
    }
    statement {
      rate_based_statement {
        limit                 = max(10, var.waf.rate_limit_per_minute)
        evaluation_window_sec = 60
        aggregate_key_type    = "IP"
      }
    }
    visibility_config {
      cloudwatch_metrics_enabled = true
      metric_name                = "limite-general"
      sampled_requests_enabled   = true
    }
  }
}

# ── Distribución de la app (ALB interno por VPC origin) ─────────────────────────────────────────────────────────
resource "aws_cloudfront_vpc_origin" "alb" {
  vpc_origin_endpoint_config {
    name                   = "${var.name}-alb"
    arn                    = local.first_origin.alb_arn
    http_port              = 80
    https_port             = 443
    origin_protocol_policy = "http-only" # el tramo CloudFront → ALB va por la red de AWS, dentro de la VPC
    origin_ssl_protocols {
      items    = ["TLSv1.2"]
      quantity = 1
    }
  }
  tags = var.context.labels
}

resource "aws_cloudfront_distribution" "app" {
  enabled         = true
  comment         = "Mirai ${var.name}: web, api y tiempo real (mismo origen)."
  aliases         = local.container_hosts
  price_class     = try(local.opts.price_class, "PriceClass_All")
  http_version    = "http2and3"
  is_ipv6_enabled = var.enable_ipv6
  web_acl_id      = aws_wafv2_web_acl.this.arn
  tags            = var.context.labels

  origin {
    origin_id   = "alb"
    domain_name = local.first_origin.alb_dns_name
    vpc_origin_config {
      vpc_origin_id            = aws_cloudfront_vpc_origin.alb.id
      origin_read_timeout      = try(local.opts.origin_read_timeout_s, 60)
      origin_keepalive_timeout = 60
    }
  }

  default_cache_behavior {
    target_origin_id         = "alb"
    viewer_protocol_policy   = "redirect-to-https"
    allowed_methods          = ["GET", "HEAD", "OPTIONS", "PUT", "POST", "PATCH", "DELETE"]
    cached_methods           = ["GET", "HEAD"]
    cache_policy_id          = local.cache_disabled
    origin_request_policy_id = local.all_viewer
    compress                 = true
  }

  ordered_cache_behavior {
    path_pattern             = "/_next/static/*"
    target_origin_id         = "alb"
    viewer_protocol_policy   = "redirect-to-https"
    allowed_methods          = ["GET", "HEAD", "OPTIONS"]
    cached_methods           = ["GET", "HEAD"]
    cache_policy_id          = local.cache_optimized
    origin_request_policy_id = local.all_viewer
    compress                 = true
  }

  dynamic "ordered_cache_behavior" {
    for_each = local.no_cache_paths
    content {
      path_pattern             = ordered_cache_behavior.value
      target_origin_id         = "alb"
      viewer_protocol_policy   = "redirect-to-https"
      allowed_methods          = ["GET", "HEAD", "OPTIONS", "PUT", "POST", "PATCH", "DELETE"]
      cached_methods           = ["GET", "HEAD"]
      cache_policy_id          = local.cache_disabled
      origin_request_policy_id = local.all_viewer
      compress                 = true
    }
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    acm_certificate_arn      = local.cert_arn
    ssl_support_method       = "sni-only"
    minimum_protocol_version = "TLSv1.2_2021"
  }
}

# ── Distribuciones de archivos públicos (S3 + OAC) ──────────────────────────────────────────────────────────────
resource "aws_cloudfront_origin_access_control" "s3" {
  for_each                          = var.bucket_origins
  name                              = substr("${var.name}-${each.key}", 0, 64)
  description                       = "OAC de ${each.key} (${var.name})."
  origin_access_control_origin_type = "s3"
  signing_behavior                  = "always"
  signing_protocol                  = "sigv4"
}

resource "aws_cloudfront_cache_policy" "files" {
  for_each    = var.bucket_origins
  name        = substr("${var.name}-${each.key}", 0, 64)
  comment     = "Archivos públicos de ${var.name}."
  min_ttl     = 0
  default_ttl = each.value.default_ttl
  max_ttl     = each.value.max_ttl

  parameters_in_cache_key_and_forwarded_to_origin {
    enable_accept_encoding_brotli = true
    enable_accept_encoding_gzip   = true
    cookies_config {
      cookie_behavior = "none"
    }
    headers_config {
      header_behavior = "none"
    }
    query_strings_config {
      query_string_behavior = "none"
    }
  }
}

resource "aws_cloudfront_distribution" "files" {
  for_each        = var.bucket_origins
  enabled         = true
  comment         = "Mirai ${var.name}: archivos públicos (${each.key})."
  aliases         = local.bucket_hosts[each.key]
  price_class     = try(local.opts.price_class, "PriceClass_All")
  http_version    = "http2and3"
  is_ipv6_enabled = var.enable_ipv6
  web_acl_id      = aws_wafv2_web_acl.this.arn
  tags            = var.context.labels

  origin {
    origin_id                = "s3"
    domain_name              = each.value.origin.regional_domain_name
    origin_access_control_id = aws_cloudfront_origin_access_control.s3[each.key].id
  }

  default_cache_behavior {
    target_origin_id       = "s3"
    viewer_protocol_policy = "redirect-to-https"
    allowed_methods        = ["GET", "HEAD", "OPTIONS"]
    cached_methods         = ["GET", "HEAD"]
    cache_policy_id        = aws_cloudfront_cache_policy.files[each.key].id
    compress               = true
  }

  restrictions {
    geo_restriction {
      restriction_type = "none"
    }
  }

  viewer_certificate {
    acm_certificate_arn      = local.cert_arn
    ssl_support_method       = "sni-only"
    minimum_protocol_version = "TLSv1.2_2021"
  }
}

locals {
  validation_records = [
    for o in distinct([for d in aws_acm_certificate.this.domain_validation_options : {
      name = trimsuffix(d.resource_record_name, ".")
      type = d.resource_record_type
      data = trimsuffix(d.resource_record_value, ".")
    }]) : o
  ]
}
