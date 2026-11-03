# Azure DNS (opcional): zona pública de mirai.engynex.com y sus registros. Se delega desde Hostinger con los NS de la
# salida name_servers. Los nombres de registros van como FQDN sin punto final y se pasan a relativos a la zona.
# context.cloud: resource_group_name.

locals {
  rg = var.context.cloud["resource_group_name"]

  zone_name = var.create_zone ? azurerm_dns_zone.this[0].name : data.azurerm_dns_zone.this[0].name

  records = {
    for r in var.records : "${r.type}/${r.name}" => merge(r, {
      relative = r.name == var.zone_name ? "@" : trimsuffix(trimsuffix(r.name, var.zone_name), ".")
    })
  }
  by_type = { for t in ["A", "AAAA", "CNAME", "TXT", "MX", "CAA"] : t => { for k, r in local.records : k => r if r.type == t } }
}

resource "azurerm_dns_zone" "this" {
  count               = var.create_zone ? 1 : 0
  name                = var.zone_name
  resource_group_name = local.rg
  tags                = var.context.labels
}

data "azurerm_dns_zone" "this" {
  count               = var.create_zone ? 0 : 1
  name                = var.zone_name
  resource_group_name = local.rg
}

resource "azurerm_dns_a_record" "this" {
  for_each            = local.by_type["A"]
  name                = each.value.relative
  zone_name           = local.zone_name
  resource_group_name = local.rg
  ttl                 = each.value.ttl
  records             = each.value.values
}

resource "azurerm_dns_aaaa_record" "this" {
  for_each            = local.by_type["AAAA"]
  name                = each.value.relative
  zone_name           = local.zone_name
  resource_group_name = local.rg
  ttl                 = each.value.ttl
  records             = each.value.values
}

resource "azurerm_dns_cname_record" "this" {
  for_each            = local.by_type["CNAME"]
  name                = each.value.relative
  zone_name           = local.zone_name
  resource_group_name = local.rg
  ttl                 = each.value.ttl
  record              = each.value.values[0]
}

resource "azurerm_dns_txt_record" "this" {
  for_each            = local.by_type["TXT"]
  name                = each.value.relative
  zone_name           = local.zone_name
  resource_group_name = local.rg
  ttl                 = each.value.ttl

  dynamic "record" {
    for_each = each.value.values
    content {
      value = record.value
    }
  }
}

# MX: cada valor "prioridad servidor" (p. ej. "10 feedback-smtp.us-east-1.amazonses.com").
resource "azurerm_dns_mx_record" "this" {
  for_each            = local.by_type["MX"]
  name                = each.value.relative
  zone_name           = local.zone_name
  resource_group_name = local.rg
  ttl                 = each.value.ttl

  dynamic "record" {
    for_each = each.value.values
    content {
      preference = tonumber(split(" ", record.value)[0])
      exchange   = split(" ", record.value)[1]
    }
  }
}

# CAA: cada valor "flags etiqueta valor" (p. ej. "0 issue letsencrypt.org").
resource "azurerm_dns_caa_record" "this" {
  for_each            = local.by_type["CAA"]
  name                = each.value.relative
  zone_name           = local.zone_name
  resource_group_name = local.rg
  ttl                 = each.value.ttl

  dynamic "record" {
    for_each = each.value.values
    content {
      flags = tonumber(split(" ", record.value)[0])
      tag   = split(" ", record.value)[1]
      value = trim(join(" ", slice(split(" ", record.value), 2, length(split(" ", record.value)))), "\"")
    }
  }
}
