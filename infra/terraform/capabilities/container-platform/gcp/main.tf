# container-platform (GCP): Cloud Run no necesita clúster ni entorno; esta implementación solo arma el handle que
# usan los servicios (proyecto, región y red para Direct VPC egress). log_retention_days: la retención de Cloud
# Logging es del proyecto (_Default = 30 días); cloud_options: network_tags (lista de etiquetas de red).

locals {
  platform = {
    project_id     = var.context.cloud.project_id
    project_number = lookup(var.context.cloud, "project_number", "")
    region         = var.context.region
    network        = var.network
    tags           = try(var.cloud_options.network_tags, ["${var.context.prefix}-run"])
  }
}
