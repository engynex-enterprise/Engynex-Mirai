# Borde en Azure Front Door Premium: perfil + endpoint, un grupo de origen por origen, dominios personalizados con
# certificado administrado, rutas por dominio y por camino (mismo origen) y WAF.
# - Rutas: cada dominio de `hosts` tiene una ruta /* a su origen; cada regla de `routes` agrega una ruta con sus caminos
#   (Front Door elige la más específica: /v1/* gana sobre /*). Los orígenes con cdn suman una ruta /_next/static/* con
#   caché (respeta Cache-Control: immutable); el resto va sin caché (sw.js, páginas privadas). Los buckets públicos
#   van con caché y el camino de origen /objetos. El dominio *.azurefd.net del endpoint va a default_origin.
# - Host del origen: el FQDN de la Container App (ACA enruta por Host); Front Door manda el dominio original en
#   X-Forwarded-Host. Afinidad: el grupo de origen del gateway usa la cookie de afinidad de Front Door.
# - Certificados: uno administrado por dominio (Front Door no emite comodines). certificate_domains y
#   dns_authorization_domains se ignoran; dns_records da el TXT _dnsauth y el CNAME de cada dominio (en Hostinger).
# - WAF: Microsoft_DefaultRuleSet 2.1 + BotManager 1.1 en Detection (waf_preview) o Prevention. waf_sensitivity y
#   adaptive_protection no tienen equivalente (se ignoran). Reglas propias: IP bloqueadas, IP de confianza (Allow,
#   sin WAF), webhooks de pagos con límite por IP y sin WAF (Allow después del límite), IA/chat con límite y límite
#   general por IP.
# - Tiempo de respuesta máximo de Front Door: 240 s (el chat en streaming debe mandar datos antes).
# - enable_ipv6 se ignora (Front Door ya responde en IPv4 e IPv6). log_sample_rate se ignora (diagnóstico aparte).
# cloud_options: private_link (bool, false) → los orígenes de contenedores entran por Private Link al entorno
#   interno (la conexión se aprueba una vez en el entorno de Container Apps); response_timeout_s (240).
# context.cloud: resource_group_name.

locals {
  rg           = var.context.cloud["resource_group_name"]
  private_link = try(var.cloud_options.private_link, false)
  waf_name     = substr(replace("${var.name}waf", "-", ""), 0, 128)

  all_origins = merge(
    { for k, o in var.origins : k => { host = o.origin.host, path = "/", bucket = false, cdn = o.cdn, affinity = try(o.origin.session_affinity, false), probe = try(o.origin.health_path, null), environment_id = try(o.origin.environment_id, null), location = try(o.origin.location, var.context.region), origin_path = null } },
    { for k, b in var.bucket_origins : k => { host = b.origin.host, path = "/", bucket = true, cdn = true, affinity = false, probe = null, environment_id = null, location = var.context.region, origin_path = b.origin.origin_path } },
  )

  domain_key = { for h in keys(var.hosts) : h => substr(replace(h, ".", "-"), 0, 60) }

  # Ruta base de cada dominio + ruta de caché de Next + rutas por camino.
  host_routes = { for h, o in var.hosts : "h-${local.domain_key[h]}" => { hosts = [h], patterns = ["/*"], origin = o, cache = local.all_origins[o].bucket } }
  static_routes = {
    for h, o in var.hosts : "s-${local.domain_key[h]}" => { hosts = [h], patterns = ["/_next/static/*"], origin = o, cache = true }
    if local.all_origins[o].cdn && !local.all_origins[o].bucket
  }
  path_routes = {
    for i, r in var.routes : "p-${i}-${r.origin}" => {
      hosts    = [for h in r.hosts : h if contains(keys(var.hosts), h)]
      patterns = r.paths
      origin   = r.origin
      cache    = false
    }
  }
  routes = merge(local.host_routes, local.static_routes, { for k, r in local.path_routes : k => r if length(r.hosts) > 0 })

  routes_by_domain = { for h in keys(var.hosts) : h => [for k, r in local.routes : k if contains(r.hosts, h)] }

  webhook_values  = ["/v1/webhooks/", "/api/pagos/"]
  sensitive_regex = "^https?://[^/]+(/v1/books/[^/]+/(ai|chat)/|/api/chat)"
  all_ips         = ["0.0.0.0/0", "::/0"]
}

resource "azurerm_cdn_frontdoor_profile" "this" {
  name                     = "${var.name}-fd"
  resource_group_name      = local.rg
  sku_name                 = "Premium_AzureFrontDoor"
  response_timeout_seconds = try(var.cloud_options.response_timeout_s, 240)
  tags                     = var.context.labels
}

resource "azurerm_cdn_frontdoor_endpoint" "this" {
  name                     = var.name
  cdn_frontdoor_profile_id = azurerm_cdn_frontdoor_profile.this.id
  tags                     = var.context.labels
}

# ── Orígenes ───────────────────────────────────────────────────────────────────────────────────────────────────
resource "azurerm_cdn_frontdoor_origin_group" "this" {
  for_each                 = local.all_origins
  name                     = each.key
  cdn_frontdoor_profile_id = azurerm_cdn_frontdoor_profile.this.id
  session_affinity_enabled = each.value.affinity

  load_balancing {
    sample_size                 = 4
    successful_samples_required = 3
  }

  dynamic "health_probe" {
    for_each = each.value.probe == null ? [] : [each.value.probe]
    content {
      protocol            = "Https"
      path                = health_probe.value
      request_type        = "GET"
      interval_in_seconds = 60
    }
  }
}

resource "azurerm_cdn_frontdoor_origin" "this" {
  for_each                       = local.all_origins
  name                           = each.key
  cdn_frontdoor_origin_group_id  = azurerm_cdn_frontdoor_origin_group.this[each.key].id
  host_name                      = each.value.host
  origin_host_header             = each.value.host
  https_port                     = 443
  certificate_name_check_enabled = true
  enabled                        = true
  priority                       = 1
  weight                         = 1000

  dynamic "private_link" {
    for_each = local.private_link && !each.value.bucket && each.value.environment_id != null ? [1] : []
    content {
      location               = each.value.location
      private_link_target_id = each.value.environment_id
      target_type            = "managedEnvironments"
      request_message        = "Front Door de ${var.name}"
    }
  }
}

# ── Dominios y rutas ───────────────────────────────────────────────────────────────────────────────────────────
resource "azurerm_cdn_frontdoor_custom_domain" "this" {
  for_each                 = var.hosts
  name                     = local.domain_key[each.key]
  cdn_frontdoor_profile_id = azurerm_cdn_frontdoor_profile.this.id
  host_name                = each.key

  tls {
    certificate_type = "ManagedCertificate"
    minimum_version  = "TLS12"
  }
}

resource "azurerm_cdn_frontdoor_route" "this" {
  for_each                        = local.routes
  name                            = each.key
  cdn_frontdoor_endpoint_id       = azurerm_cdn_frontdoor_endpoint.this.id
  cdn_frontdoor_origin_group_id   = azurerm_cdn_frontdoor_origin_group.this[each.value.origin].id
  cdn_frontdoor_origin_ids        = [azurerm_cdn_frontdoor_origin.this[each.value.origin].id]
  cdn_frontdoor_custom_domain_ids = [for h in each.value.hosts : azurerm_cdn_frontdoor_custom_domain.this[h].id]
  cdn_frontdoor_origin_path       = local.all_origins[each.value.origin].origin_path
  patterns_to_match               = each.value.patterns
  supported_protocols             = ["Http", "Https"]
  https_redirect_enabled          = true
  forwarding_protocol             = "HttpsOnly"
  link_to_default_domain          = false

  dynamic "cache" {
    for_each = each.value.cache ? [1] : []
    content {
      query_string_caching_behavior = "UseQueryString"
      compression_enabled           = true
      content_types_to_compress     = ["text/html", "text/css", "text/javascript", "application/javascript", "application/json", "image/svg+xml"]
    }
  }
}

# El dominio del endpoint (*.azurefd.net) va al origen por defecto (pruebas antes de mover el DNS).
resource "azurerm_cdn_frontdoor_route" "default" {
  name                          = "default"
  cdn_frontdoor_endpoint_id     = azurerm_cdn_frontdoor_endpoint.this.id
  cdn_frontdoor_origin_group_id = azurerm_cdn_frontdoor_origin_group.this[var.default_origin].id
  cdn_frontdoor_origin_ids      = [azurerm_cdn_frontdoor_origin.this[var.default_origin].id]
  patterns_to_match             = ["/*"]
  supported_protocols           = ["Http", "Https"]
  https_redirect_enabled        = true
  forwarding_protocol           = "HttpsOnly"
  link_to_default_domain        = true
}

resource "azurerm_cdn_frontdoor_custom_domain_association" "this" {
  for_each                       = var.hosts
  cdn_frontdoor_custom_domain_id = azurerm_cdn_frontdoor_custom_domain.this[each.key].id
  cdn_frontdoor_route_ids        = [for k in local.routes_by_domain[each.key] : azurerm_cdn_frontdoor_route.this[k].id]
}

# ── WAF ────────────────────────────────────────────────────────────────────────────────────────────────────────
resource "azurerm_cdn_frontdoor_firewall_policy" "this" {
  name                              = local.waf_name
  resource_group_name               = local.rg
  sku_name                          = "Premium_AzureFrontDoor"
  enabled                           = true
  mode                              = var.waf.waf_preview ? "Detection" : "Prevention"
  request_body_check_enabled        = true
  custom_block_response_status_code = 403
  tags                              = var.context.labels

  dynamic "custom_rule" {
    for_each = length(var.waf.deny_ip_ranges) > 0 ? [1] : []
    content {
      name     = "IpBloqueadas"
      priority = 1
      type     = "MatchRule"
      action   = "Block"
      match_condition {
        match_variable = "RemoteAddr"
        operator       = "IPMatch"
        match_values   = var.waf.deny_ip_ranges
      }
    }
  }

  dynamic "custom_rule" {
    for_each = length(var.waf.allow_ip_ranges) > 0 ? [1] : []
    content {
      name     = "IpConfianza"
      priority = 2
      type     = "MatchRule"
      action   = "Allow"
      match_condition {
        match_variable = "RemoteAddr"
        operator       = "IPMatch"
        match_values   = var.waf.allow_ip_ranges
      }
    }
  }

  # Webhooks de Mercado Pago y Wompi: la autenticidad la da la firma. Límite por IP y, si cumple, sin WAF.
  custom_rule {
    name                           = "WebhooksLimite"
    priority                       = 10
    type                           = "RateLimitRule"
    action                         = "Block"
    rate_limit_duration_in_minutes = 1
    rate_limit_threshold           = var.waf.webhook_rate_limit_per_minute
    match_condition {
      match_variable = "RequestUri"
      operator       = "Contains"
      match_values   = local.webhook_values
    }
  }

  custom_rule {
    name     = "WebhooksSinWaf"
    priority = 11
    type     = "MatchRule"
    action   = "Allow"
    match_condition {
      match_variable = "RequestUri"
      operator       = "Contains"
      match_values   = local.webhook_values
    }
  }

  # IA y chat cuestan por petición (la API además limita por hogar).
  custom_rule {
    name                           = "IaChatLimite"
    priority                       = 20
    type                           = "RateLimitRule"
    action                         = "Block"
    rate_limit_duration_in_minutes = 1
    rate_limit_threshold           = var.waf.sensitive_rate_limit_per_minute
    match_condition {
      match_variable = "RequestUri"
      operator       = "RegEx"
      match_values   = [local.sensitive_regex]
    }
  }

  custom_rule {
    name                           = "LimiteGeneral"
    priority                       = 30
    type                           = "RateLimitRule"
    action                         = "Block"
    rate_limit_duration_in_minutes = 1
    rate_limit_threshold           = var.waf.rate_limit_per_minute
    match_condition {
      match_variable = "RemoteAddr"
      operator       = "IPMatch"
      match_values   = local.all_ips
    }
  }

  managed_rule {
    type    = "Microsoft_DefaultRuleSet"
    version = "2.1"
    action  = "Block"
  }

  managed_rule {
    type    = "Microsoft_BotManagerRuleSet"
    version = "1.1"
    action  = "Block"
  }
}

resource "azurerm_cdn_frontdoor_security_policy" "this" {
  name                     = "${var.name}-waf"
  cdn_frontdoor_profile_id = azurerm_cdn_frontdoor_profile.this.id

  security_policies {
    firewall {
      cdn_frontdoor_firewall_policy_id = azurerm_cdn_frontdoor_firewall_policy.this.id
      association {
        patterns_to_match = ["/*"]
        dynamic "domain" {
          for_each = concat([azurerm_cdn_frontdoor_endpoint.this.id], [for d in azurerm_cdn_frontdoor_custom_domain.this : d.id])
          content {
            cdn_frontdoor_domain_id = domain.value
          }
        }
      }
    }
  }
}
