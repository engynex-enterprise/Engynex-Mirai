# dns/aws: zona de Route 53 (creada o existente) y sus registros. Hoy el DNS vive en Hostinger: esto sirve el día que
# se delegue mirai.engynex.com (registros NS en Hostinger con name_servers). cloud_options: ninguna.

resource "aws_route53_zone" "this" {
  count   = var.create_zone ? 1 : 0
  name    = var.zone_name
  comment = "Mirai ${var.context.environment} (Terraform)."
  tags    = var.context.labels
}

data "aws_route53_zone" "this" {
  count = var.create_zone ? 0 : 1
  name  = var.zone_name
}

locals {
  zone_id      = var.create_zone ? aws_route53_zone.this[0].zone_id : data.aws_route53_zone.this[0].zone_id
  name_servers = var.create_zone ? aws_route53_zone.this[0].name_servers : data.aws_route53_zone.this[0].name_servers
}

resource "aws_route53_record" "this" {
  for_each = { for r in var.records : "${r.name}/${r.type}" => r }
  zone_id  = local.zone_id
  name     = each.value.name
  type     = each.value.type
  ttl      = each.value.ttl
  records  = each.value.values
}
