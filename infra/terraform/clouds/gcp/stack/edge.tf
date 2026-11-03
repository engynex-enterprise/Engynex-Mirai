# Borde: balanceador HTTPS global, certificado, Cloud Armor y Cloud CDN (capacidad edge).
# Mismo origen (D2): en el dominio de la web, /v1/* y /api/auth/* van a la API y /socket.io/* al gateway.
# Los orígenes "canary-*" apuntan a la revisión etiquetada "canary" (la que el CI/CD acaba de desplegar sin tráfico)
# para la prueba de humo por el balanceador antes de moverle tráfico.

locals {
  edge_origins = merge(
    {
      web        = { origin = module.web.edge_origin, cdn = true, log_sample_rate = var.log_sample_rate }
      api        = { origin = module.api.edge_origin, log_sample_rate = var.log_sample_rate }
      canary-web = { origin = merge(module.web.edge_origin, { tag = "canary" }), log_sample_rate = 1.0 }
      canary-api = { origin = merge(module.api.edge_origin, { tag = "canary" }), log_sample_rate = 1.0 }
    },
    local.f.realtime ? {
      realtime = { origin = module.realtime[0].edge_origin, log_sample_rate = var.log_sample_rate }
    } : {},
  )

  host_rules = merge(module.app.hosts, module.app.canary_hosts)

  # Resumen (backend del dominio → caminos que se desvían) para las pruebas y para leer el plan.
  path_rules_check = {
    for m in distinct(flatten([for r in module.app.routes : [for h in r.hosts : local.host_rules[h]]])) :
    m => flatten([for r in module.app.routes : r.paths if contains([for h in r.hosts : local.host_rules[h]], m)])
  }
}

module "lb" {
  count                     = local.f.edge ? 1 : 0
  source                    = "../../../capabilities/edge/gcp"
  context                   = local.context
  name                      = local.prefix
  origins                   = local.edge_origins
  bucket_origins            = local.f.storage ? { files = { origin = module.storage[0].public_origin } } : {}
  hosts                     = local.host_rules
  routes                    = module.app.routes
  default_origin            = "web"
  certificate_domains       = var.domains.certificate
  dns_authorization_domains = var.domains.dns_authorization_domains
  waf                       = var.waf
}

module "dns" {
  count       = local.f.dns && local.f.edge ? 1 : 0
  source      = "../../../capabilities/dns/gcp"
  context     = local.context
  zone_name   = var.dns.zone_name
  create_zone = var.dns.create_zone
  # Solo los A (sus nombres se conocen al planear). Los CNAME _acme-challenge del certificado salen en dns_records y
  # se crean en una segunda pasada o a mano (sus nombres solo existen después de crear la autorización).
  records = [
    for h in keys(local.host_rules) : { name = h, type = "A", values = [module.lb[0].ip_or_cname] }
    if endswith(h, var.dns.zone_name)
  ]
}
