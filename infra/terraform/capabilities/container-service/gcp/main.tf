# container-service (GCP): Cloud Run v2 (envuelve modules/cloud-run-service). Cloud Build o GitHub Actions cambian la
# imagen y el tráfico (canario por revisiones etiquetadas); Terraform los ignora.
# `routes` no se usa aquí: en GCP las reglas por dominio y camino las arma el balanceador (capacidad edge).
# cloud_options:
#   vpc_egress   PRIVATE_RANGES_ONLY (por defecto) | ALL_TRAFFIC (todo por la VPC: NAT y llamadas a *.run.app internas)
#   vpc          false = sin Direct VPC egress
#   public       true (por defecto) = invoker_iam_disabled: la app autentica (compatible con la política que prohíbe allUsers)
#   startup_cpu_boost (true)
#   otel_collector { image, config }: colector OpenTelemetry como sidecar (config = YAML de infra/otel/collector.gcp.yaml,
#                  va en OTELCOL_CONFIG y el colector lo lee con --config=env:OTELCOL_CONFIG).
# cpu: Cloud Run con concurrencia > 1 necesita al menos 1 vCPU, así que 0.25 y 0.5 se redondean a 1.

locals {
  cpu = contains(["0.25", "0.5"], var.cpu) ? "1" : var.cpu

  ingress = {
    edge     = "INGRESS_TRAFFIC_INTERNAL_LOAD_BALANCER"
    internal = "INGRESS_TRAFFIC_INTERNAL_ONLY"
    public   = "INGRESS_TRAFFIC_ALL"
  }[var.ingress]

  otel = try(var.cloud_options.otel_collector, null)
  sidecars = local.otel == null ? {} : {
    otel = {
      image = local.otel.image
      args  = ["--config=env:OTELCOL_CONFIG"]
      env   = merge(try(local.otel.env, {}), { OTELCOL_CONFIG = local.otel.config })
    }
  }

  use_vpc = try(var.cloud_options.vpc, true)
  vpc = local.use_vpc ? {
    network    = var.platform.network.network_id
    subnetwork = var.platform.network.subnet_id
    egress     = try(var.cloud_options.vpc_egress, "PRIVATE_RANGES_ONLY")
    tags       = var.platform.tags
  } : null
}

module "this" {
  source                = "../../../modules/cloud-run-service"
  project_id            = var.platform.project_id
  region                = var.platform.region
  name                  = var.name
  description           = var.description
  labels                = var.context.labels
  image                 = coalesce(var.image, "us-docker.pkg.dev/cloudrun/container/hello")
  command               = var.command
  args                  = var.args
  service_account_email = var.identity.email
  container_port        = var.port
  cpu                   = local.cpu
  memory                = var.memory
  cpu_idle              = !var.always_on_cpu
  startup_cpu_boost     = try(var.cloud_options.startup_cpu_boost, true)
  min_instances         = var.min_instances
  max_instances         = var.max_instances
  concurrency           = var.concurrency
  timeout_seconds       = var.timeout_s
  session_affinity      = var.session_affinity
  ingress               = local.ingress
  public                = try(var.cloud_options.public, true)
  invoker_members       = var.invokers
  vpc                   = local.vpc
  sidecars              = local.sidecars
  deletion_protection   = var.deletion_protection

  env        = var.env
  secret_env = { for k, ref in var.secret_env : k => { secret = ref } }

  startup_probe = { type = var.probes.startup, path = coalesce(var.health_path, "/healthz") }
  liveness_path = var.probes.liveness ? var.health_path : null
}
