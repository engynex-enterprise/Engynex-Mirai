# Balanceador HTTPS externo global (Application Load Balancer, EXTERNAL_MANAGED) para un ambiente:
# - web (Next.js) con Cloud CDN, api y realtime (WebSocket) por NEG serverless, archivos públicos desde un bucket con CDN.
# - Certificado administrado de Certificate Manager con autorización DNS (se emite antes de cambiar el DNS).
# - Cloud Armor: WAF preconfigurado, límites por IP y exención controlada para los webhooks de pagos.
# - Redirección 80 → 443.

locals {
  all_backend_keys = concat(keys(var.serverless_backends), keys(var.bucket_backends))

  backend_ids = merge(
    { for k, b in google_compute_backend_service.run : k => b.id },
    { for k, b in google_compute_backend_bucket.this : k => b.id },
  )

  # Un path_matcher por backend con todos sus dominios.
  hosts_by_backend = {
    for b in distinct(values(var.host_rules)) : b => [for h, bb in var.host_rules : h if bb == b]
  }

  waf_rules = {
    1000 = "sqli-v33-stable"
    1001 = "xss-v33-stable"
    1002 = "lfi-v33-stable"
    1003 = "rfi-v33-stable"
    1004 = "rce-v33-stable"
    1005 = "methodenforcement-v33-stable"
    1006 = "scannerdetection-v33-stable"
    1007 = "protocolattack-v33-stable"
    1008 = "sessionfixation-v33-stable"
  }

  webhook_expr   = "request.path.startsWith('/v1/webhooks/') || request.path.startsWith('/api/pagos/')"
  sensitive_expr = "request.path.matches('^/v1/books/[^/]+/(ai|chat)/') || request.path.startsWith('/api/chat')"

  cert_map_hosts = distinct(keys(var.host_rules))
}

# ── Direcciones ────────────────────────────────────────────────────────────────────────────────────────────────
resource "google_compute_global_address" "v4" {
  project      = var.project_id
  name         = "${var.name}-lb-ipv4"
  ip_version   = "IPV4"
  address_type = "EXTERNAL"
  labels       = var.labels
}

resource "google_compute_global_address" "v6" {
  count        = var.enable_ipv6 ? 1 : 0
  project      = var.project_id
  name         = "${var.name}-lb-ipv6"
  ip_version   = "IPV6"
  address_type = "EXTERNAL"
  labels       = var.labels
}

# ── Cloud Armor ────────────────────────────────────────────────────────────────────────────────────────────────
resource "google_compute_security_policy" "this" {
  project     = var.project_id
  name        = "${var.name}-armor"
  description = "WAF y límites de Mirai (${var.name})."
  type        = "CLOUD_ARMOR"
  labels      = var.labels

  advanced_options_config {
    json_parsing = "STANDARD"
    log_level    = "NORMAL"
  }

  dynamic "adaptive_protection_config" {
    for_each = var.armor.adaptive_protection ? [1] : []
    content {
      layer_7_ddos_defense_config {
        enable = true
      }
    }
  }

  dynamic "rule" {
    for_each = length(var.armor.deny_ip_ranges) > 0 ? [1] : []
    content {
      priority    = 100
      action      = "deny(403)"
      description = "IP bloqueadas a mano."
      match {
        versioned_expr = "SRC_IPS_V1"
        config {
          src_ip_ranges = var.armor.deny_ip_ranges
        }
      }
    }
  }

  dynamic "rule" {
    for_each = length(var.armor.allow_ip_ranges) > 0 ? [1] : []
    content {
      priority    = 200
      action      = "allow"
      description = "IP de confianza (monitoreo propio, oficina): sin WAF ni límites."
      match {
        versioned_expr = "SRC_IPS_V1"
        config {
          src_ip_ranges = var.armor.allow_ip_ranges
        }
      }
    }
  }

  # Webhooks de Mercado Pago y Wompi: la autenticidad la da la firma; el WAF podría bloquear un JSON legítimo.
  # Se limitan por IP y, si cumplen, se permiten sin pasar por el WAF.
  rule {
    priority    = 900
    action      = "throttle"
    description = "Webhooks de pagos: límite por IP, sin WAF."
    match {
      expr {
        expression = local.webhook_expr
      }
    }
    rate_limit_options {
      conform_action = "allow"
      exceed_action  = "deny(429)"
      enforce_on_key = "IP"
      rate_limit_threshold {
        count        = var.armor.webhook_rate_limit_per_minute
        interval_sec = 60
      }
    }
  }

  dynamic "rule" {
    for_each = local.waf_rules
    content {
      priority    = rule.key
      action      = "deny(403)"
      preview     = var.armor.waf_preview
      description = "WAF ${rule.value}"
      match {
        expr {
          expression = "evaluatePreconfiguredWaf('${rule.value}', {'sensitivity': ${var.armor.waf_sensitivity}})"
        }
      }
    }
  }

  rule {
    priority    = 1100
    action      = "deny(403)"
    preview     = var.armor.waf_preview
    description = "WAF cve-canary (Log4j y CVE conocidos)."
    match {
      expr {
        expression = "evaluatePreconfiguredWaf('cve-canary', {'sensitivity': 1})"
      }
    }
  }

  # IA y chat: cuestan dinero por petición. La API además limita por hogar (rate_limit_hit).
  rule {
    priority    = 2000
    action      = "throttle"
    description = "IA y chat: límite por IP."
    match {
      expr {
        expression = local.sensitive_expr
      }
    }
    rate_limit_options {
      conform_action = "allow"
      exceed_action  = "deny(429)"
      enforce_on_key = "IP"
      rate_limit_threshold {
        count        = var.armor.sensitive_rate_limit_per_minute
        interval_sec = 60
      }
    }
  }

  rule {
    priority    = 3000
    action      = "throttle"
    description = "Límite general por IP."
    match {
      versioned_expr = "SRC_IPS_V1"
      config {
        src_ip_ranges = ["*"]
      }
    }
    rate_limit_options {
      conform_action = "allow"
      exceed_action  = "deny(429)"
      enforce_on_key = "IP"
      rate_limit_threshold {
        count        = var.armor.rate_limit_per_minute
        interval_sec = 60
      }
    }
  }

  rule {
    priority    = 2147483647
    action      = "allow"
    description = "Regla por defecto."
    match {
      versioned_expr = "SRC_IPS_V1"
      config {
        src_ip_ranges = ["*"]
      }
    }
  }
}

# ── Backends ───────────────────────────────────────────────────────────────────────────────────────────────────
resource "google_compute_region_network_endpoint_group" "run" {
  for_each              = var.serverless_backends
  project               = var.project_id
  region                = var.region
  name                  = "${var.name}-${each.key}-neg"
  network_endpoint_type = "SERVERLESS"

  cloud_run {
    service = each.value.service
    tag     = each.value.tag
  }
}

resource "google_compute_backend_service" "run" {
  for_each              = var.serverless_backends
  project               = var.project_id
  name                  = "${var.name}-${each.key}-be"
  load_balancing_scheme = "EXTERNAL_MANAGED"
  protocol              = "HTTPS"
  enable_cdn            = each.value.cdn
  compression_mode      = each.value.cdn ? "AUTOMATIC" : null
  security_policy       = each.value.armor ? google_compute_security_policy.this.id : null

  backend {
    group = google_compute_region_network_endpoint_group.run[each.key].id
  }

  dynamic "cdn_policy" {
    for_each = each.value.cdn ? [1] : []
    content {
      cache_mode         = "USE_ORIGIN_HEADERS"
      serve_while_stale  = 86400
      request_coalescing = true
      negative_caching   = false
      cache_key_policy {
        include_host         = true
        include_protocol     = true
        include_query_string = true
      }
    }
  }

  log_config {
    enable      = true
    sample_rate = each.value.log_sample_rate
  }
}

resource "google_compute_backend_bucket" "this" {
  for_each         = var.bucket_backends
  project          = var.project_id
  name             = "${var.name}-${each.key}-bb"
  bucket_name      = each.value.bucket
  enable_cdn       = true
  compression_mode = "AUTOMATIC"

  cdn_policy {
    cache_mode        = "CACHE_ALL_STATIC"
    default_ttl       = each.value.default_ttl
    client_ttl        = each.value.default_ttl
    max_ttl           = each.value.max_ttl
    serve_while_stale = 86400
    negative_caching  = true
  }
}

# ── URL map, certificado y proxies ─────────────────────────────────────────────────────────────────────────────
resource "google_compute_url_map" "https" {
  project         = var.project_id
  name            = "${var.name}-lb"
  default_service = local.backend_ids[var.default_backend]

  dynamic "host_rule" {
    for_each = local.hosts_by_backend
    content {
      hosts        = host_rule.value
      path_matcher = "pm-${host_rule.key}"
    }
  }

  dynamic "path_matcher" {
    for_each = local.hosts_by_backend
    content {
      name            = "pm-${path_matcher.key}"
      default_service = local.backend_ids[path_matcher.key]

      # Mismo origen (v7, D2): /v1/* y /api/auth/* → api, /socket.io/* → realtime dentro del dominio de la web.
      dynamic "path_rule" {
        for_each = lookup(var.path_rules, path_matcher.key, [])
        content {
          paths   = path_rule.value.paths
          service = local.backend_ids[path_rule.value.backend]
        }
      }
    }
  }

  lifecycle {
    precondition {
      condition = alltrue(concat(
        [for b in values(var.host_rules) : contains(local.all_backend_keys, b)],
        [contains(local.all_backend_keys, var.default_backend)],
        flatten([for m, rules in var.path_rules : [for r in rules : contains(local.all_backend_keys, r.backend) && contains(keys(local.hosts_by_backend), m)]]),
      ))
      error_message = "Cada host_rule, default_backend y path_rules debe apuntar a un backend definido (y cada path_rules a un backend con dominio)."
    }
  }
}

resource "google_compute_url_map" "redirect" {
  project = var.project_id
  name    = "${var.name}-lb-redirect"

  default_url_redirect {
    https_redirect         = true
    redirect_response_code = "MOVED_PERMANENTLY_DEFAULT"
    strip_query            = false
  }
}

resource "google_compute_ssl_policy" "this" {
  project         = var.project_id
  name            = "${var.name}-tls"
  profile         = "MODERN"
  min_tls_version = "TLS_1_2"
}

resource "google_certificate_manager_dns_authorization" "this" {
  for_each    = toset(var.dns_authorization_domains)
  project     = var.project_id
  name        = "${var.name}-${replace(each.key, ".", "-")}"
  domain      = each.key
  description = "Autorización DNS de ${each.key}."
  labels      = var.labels
}

resource "google_certificate_manager_certificate" "this" {
  project     = var.project_id
  name        = "${var.name}-cert"
  description = "Certificado administrado de ${var.name}."
  labels      = var.labels

  managed {
    domains            = var.certificate_domains
    dns_authorizations = [for d in google_certificate_manager_dns_authorization.this : d.id]
  }
}

resource "google_certificate_manager_certificate_map" "this" {
  project     = var.project_id
  name        = "${var.name}-certmap"
  description = "Mapa de certificados de ${var.name}."
  labels      = var.labels
}

resource "google_certificate_manager_certificate_map_entry" "hosts" {
  for_each     = toset(local.cert_map_hosts)
  project      = var.project_id
  name         = "${var.name}-${substr(replace(replace(each.key, ".", "-"), "*", "x"), 0, 40)}"
  map          = google_certificate_manager_certificate_map.this.name
  hostname     = each.key
  certificates = [google_certificate_manager_certificate.this.id]
  labels       = var.labels
}

resource "google_certificate_manager_certificate_map_entry" "primary" {
  project      = var.project_id
  name         = "${var.name}-primary"
  map          = google_certificate_manager_certificate_map.this.name
  matcher      = "PRIMARY"
  certificates = [google_certificate_manager_certificate.this.id]
  labels       = var.labels
}

resource "google_compute_target_https_proxy" "this" {
  project         = var.project_id
  name            = "${var.name}-https"
  url_map         = google_compute_url_map.https.id
  certificate_map = "//certificatemanager.googleapis.com/${google_certificate_manager_certificate_map.this.id}"
  ssl_policy      = google_compute_ssl_policy.this.id
}

resource "google_compute_target_http_proxy" "redirect" {
  project = var.project_id
  name    = "${var.name}-http"
  url_map = google_compute_url_map.redirect.id
}

resource "google_compute_global_forwarding_rule" "https_v4" {
  project               = var.project_id
  name                  = "${var.name}-https-v4"
  load_balancing_scheme = "EXTERNAL_MANAGED"
  ip_protocol           = "TCP"
  port_range            = "443"
  ip_address            = google_compute_global_address.v4.id
  target                = google_compute_target_https_proxy.this.id
  labels                = var.labels
}

resource "google_compute_global_forwarding_rule" "http_v4" {
  project               = var.project_id
  name                  = "${var.name}-http-v4"
  load_balancing_scheme = "EXTERNAL_MANAGED"
  ip_protocol           = "TCP"
  port_range            = "80"
  ip_address            = google_compute_global_address.v4.id
  target                = google_compute_target_http_proxy.redirect.id
  labels                = var.labels
}

resource "google_compute_global_forwarding_rule" "https_v6" {
  count                 = var.enable_ipv6 ? 1 : 0
  project               = var.project_id
  name                  = "${var.name}-https-v6"
  load_balancing_scheme = "EXTERNAL_MANAGED"
  ip_protocol           = "TCP"
  port_range            = "443"
  ip_address            = google_compute_global_address.v6[0].id
  target                = google_compute_target_https_proxy.this.id
  labels                = var.labels
}

resource "google_compute_global_forwarding_rule" "http_v6" {
  count                 = var.enable_ipv6 ? 1 : 0
  project               = var.project_id
  name                  = "${var.name}-http-v6"
  load_balancing_scheme = "EXTERNAL_MANAGED"
  ip_protocol           = "TCP"
  port_range            = "80"
  ip_address            = google_compute_global_address.v6[0].id
  target                = google_compute_target_http_proxy.redirect.id
  labels                = var.labels
}
