# edge (GCP): Application Load Balancer externo global + Cloud CDN + Cloud Armor + Certificate Manager (envuelve
# modules/lb-https). routes → path_rules dentro del path matcher del dominio (mismo origen).

locals {
  serverless_backends = {
    for k, o in var.origins : k => {
      service         = o.origin.service
      tag             = try(o.origin.tag, null)
      cdn             = o.cdn
      armor           = o.waf
      log_sample_rate = o.log_sample_rate
    }
  }

  bucket_backends = {
    for k, b in var.bucket_origins : k => { bucket = b.origin.bucket, default_ttl = b.default_ttl, max_ttl = b.max_ttl }
  }

  # Backend de cada dominio con rutas → lista de { paths, backend } sin repetir (dos dominios del mismo backend).
  route_pairs = distinct(flatten([
    for r in var.routes : [for h in r.hosts : { matcher = var.hosts[h], paths = r.paths, backend = r.origin } if contains(keys(var.hosts), h)]
  ]))
  path_rules = {
    for m in distinct([for p in local.route_pairs : p.matcher]) : m => [
      for p in local.route_pairs : { paths = p.paths, backend = p.backend } if p.matcher == m
    ]
  }
}

module "this" {
  source                    = "../../../modules/lb-https"
  project_id                = var.context.cloud.project_id
  region                    = var.context.region
  name                      = var.name
  labels                    = var.context.labels
  serverless_backends       = local.serverless_backends
  bucket_backends           = local.bucket_backends
  host_rules                = var.hosts
  path_rules                = local.path_rules
  default_backend           = var.default_origin
  certificate_domains       = var.certificate_domains
  dns_authorization_domains = var.dns_authorization_domains
  enable_ipv6               = var.enable_ipv6
  armor                     = var.waf
}
