# dns (GCP): zona pública de Cloud DNS (opcional; hoy el DNS vive en Hostinger) y sus registros.

locals {
  project = var.context.cloud.project_id
  zone    = var.create_zone ? google_dns_managed_zone.this[0] : data.google_dns_managed_zone.this[0]
}

resource "google_dns_managed_zone" "this" {
  count       = var.create_zone ? 1 : 0
  project     = local.project
  name        = replace(var.zone_name, ".", "-")
  dns_name    = "${var.zone_name}."
  description = "Zona de ${var.zone_name} (Terraform)."
  labels      = var.context.labels

  dnssec_config {
    state = "on"
  }
}

data "google_dns_managed_zone" "this" {
  count   = var.create_zone ? 0 : 1
  project = local.project
  name    = replace(var.zone_name, ".", "-")
}

resource "google_dns_record_set" "this" {
  for_each     = { for r in var.records : "${r.type}/${r.name}" => r }
  project      = local.project
  managed_zone = local.zone.name
  name         = "${trimsuffix(each.value.name, ".")}."
  type         = each.value.type
  ttl          = each.value.ttl
  rrdatas      = [for v in each.value.values : each.value.type == "CNAME" && !endswith(v, ".") ? "${v}." : v]
}
