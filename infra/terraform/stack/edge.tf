# Borde: balanceador HTTPS global, certificado, Cloud Armor y Cloud CDN.
# Los backends "canary-*" apuntan a la revisión etiquetada "canary" (la que Cloud Build acaba de desplegar sin
# tráfico) para la prueba de humo por el balanceador antes de moverle tráfico.

locals {
  serverless_backends = merge(
    {
      web        = { service = module.web.name, cdn = true, log_sample_rate = var.lb_log_sample_rate }
      api        = { service = module.api.name, log_sample_rate = var.lb_log_sample_rate }
      canary-web = { service = module.web.name, tag = "canary", log_sample_rate = 1.0 }
      canary-api = { service = module.api.name, tag = "canary", log_sample_rate = 1.0 }
    },
    var.stages.realtime ? {
      realtime = { service = module.realtime[0].name, log_sample_rate = var.lb_log_sample_rate }
    } : {},
  )

  host_rules = merge(
    {
      (var.domains.web)        = "web"
      (var.domains.api)        = "api"
      (var.domains.canary_web) = "canary-web"
      (var.domains.canary_api) = "canary-api"
    },
    var.stages.realtime ? { (var.domains.realtime) = "realtime" } : {},
    var.stages.storage ? { (var.domains.files) = "files" } : {},
  )
}

module "lb" {
  count                     = var.stages.load_balancer ? 1 : 0
  source                    = "../modules/lb-https"
  project_id                = var.project_id
  region                    = var.region
  name                      = local.prefix
  labels                    = local.labels
  serverless_backends       = local.serverless_backends
  bucket_backends           = var.stages.storage ? { files = { bucket = module.storage[0].names["public"] } } : {}
  host_rules                = local.host_rules
  default_backend           = "web"
  certificate_domains       = var.domains.certificate
  dns_authorization_domains = var.domains.dns_authorization_domains
  armor                     = var.armor
}
