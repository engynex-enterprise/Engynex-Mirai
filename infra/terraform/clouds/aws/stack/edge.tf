# Borde: CloudFront (VPC origin → ALB interno) + AWS WAF + ACM, y la zona DNS opcional.

module "edge" {
  count   = var.features.edge ? 1 : 0
  source  = "../../../capabilities/edge/aws"
  context = local.context
  name    = local.prefix
  providers = {
    aws           = aws
    aws.us_east_1 = aws.us_east_1
  }

  origins = merge(
    {
      web = { origin = module.web.edge_origin, cdn = true, log_sample_rate = var.log_sample_rate }
      api = { origin = module.api.edge_origin, log_sample_rate = var.log_sample_rate }
    },
    var.features.realtime ? { realtime = { origin = module.realtime[0].edge_origin, log_sample_rate = var.log_sample_rate } } : {},
  )
  bucket_origins            = var.features.storage ? { files = { origin = module.storage[0].public_origin } } : {}
  hosts                     = module.app.hosts
  routes                    = module.app.routes
  default_origin            = "web"
  certificate_domains       = var.domains.certificate
  dns_authorization_domains = var.domains.dns_authorization_domains
  waf                       = var.waf

  cloud_options = {
    price_class          = var.aws.cloudfront_price_class
    wait_for_certificate = var.aws.wait_for_certificate
  }
}

locals {
  edge_records = var.features.edge ? module.edge[0].dns_records : []

  # Zona de Route 53 (features.dns): solo los CNAME de cada dominio a CloudFront, cuyos NOMBRES se conocen al planear.
  # Los CNAME de validación de ACM salen después de crear el certificado: con features.dns se copian de la salida
  # dns_records (o se aplica en dos pasos con aws.wait_for_certificate = false la primera vez).
  dns_records = var.features.edge ? [
    for h, o in module.app.hosts : {
      name   = h
      type   = "CNAME"
      values = [o == "files" ? one([for r in module.edge[0].dns_records : r.data if r.name == h]) : module.edge[0].ip_or_cname]
    }
  ] : []
}

module "dns" {
  count       = var.features.dns ? 1 : 0
  source      = "../../../capabilities/dns/aws"
  context     = local.context
  zone_name   = var.dns.zone_name
  create_zone = var.dns.create_zone
  records     = local.dns_records
}
