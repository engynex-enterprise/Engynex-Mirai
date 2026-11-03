# Red privada de un ambiente de Mirai.
# - Subred para Cloud Run con Direct VPC egress (sin conector: no hay VMs que pagar ni escalar).
# - Private Google Access: Cloud Run alcanza *.run.app y las APIs de Google por la red de Google.
# - Private Services Access: Cloud SQL (IP privada) y Memorystore Redis en un rango reservado.
# - Cloud NAT: salida a internet (Supabase, IA, Meta, Telegram, pasarelas) con IP fijas opcionales.

resource "google_compute_network" "this" {
  project                 = var.project_id
  name                    = "${var.name}-vpc"
  auto_create_subnetworks = false
  routing_mode            = "REGIONAL"
  description             = "VPC de ${var.name} (Terraform)."
}

resource "google_compute_subnetwork" "run" {
  project                  = var.project_id
  name                     = "${var.name}-run"
  region                   = var.region
  network                  = google_compute_network.this.id
  ip_cidr_range            = var.subnet_cidr
  private_ip_google_access = true
  description              = "Subred de Cloud Run (Direct VPC egress)."

  dynamic "log_config" {
    for_each = var.flow_logs ? [1] : []
    content {
      aggregation_interval = "INTERVAL_5_MIN"
      flow_sampling        = 0.2
      metadata             = "INCLUDE_ALL_METADATA"
    }
  }
}

resource "google_compute_global_address" "private_services" {
  count         = var.enable_private_services ? 1 : 0
  project       = var.project_id
  name          = "${var.name}-psa"
  purpose       = "VPC_PEERING"
  address_type  = "INTERNAL"
  prefix_length = var.private_services_prefix_length
  network       = google_compute_network.this.id
  description   = "Rango para Cloud SQL y Memorystore (Private Services Access)."
}

resource "google_service_networking_connection" "private_services" {
  count                   = var.enable_private_services ? 1 : 0
  network                 = google_compute_network.this.id
  service                 = "servicenetworking.googleapis.com"
  reserved_peering_ranges = [google_compute_global_address.private_services[0].name]
  # Al destruir, Google a veces no deja borrar el peering mientras quedan recursos; se abandona y se limpia a mano.
  deletion_policy = "ABANDON"
}

# Cortafuegos: la VPC personalizada ya niega toda entrada por defecto. Esta regla lo deja explícito y con registro.
resource "google_compute_firewall" "deny_ingress" {
  project     = var.project_id
  name        = "${var.name}-deny-ingress"
  network     = google_compute_network.this.id
  direction   = "INGRESS"
  priority    = 65000
  description = "Niega toda entrada desde internet (Cloud Run no recibe tráfico por la VPC)."

  deny {
    protocol = "all"
  }
  source_ranges = ["0.0.0.0/0"]

  log_config {
    metadata = "EXCLUDE_ALL_METADATA"
  }
}

resource "google_compute_router" "this" {
  count   = var.enable_nat ? 1 : 0
  project = var.project_id
  name    = "${var.name}-router"
  region  = var.region
  network = google_compute_network.this.id
}

resource "google_compute_address" "nat" {
  count        = var.enable_nat ? var.nat_static_ip_count : 0
  project      = var.project_id
  name         = "${var.name}-nat-${count.index}"
  region       = var.region
  address_type = "EXTERNAL"
  network_tier = "PREMIUM"
  description  = "IP fija de salida de ${var.name}."
}

resource "google_compute_router_nat" "this" {
  count                              = var.enable_nat ? 1 : 0
  project                            = var.project_id
  name                               = "${var.name}-nat"
  router                             = google_compute_router.this[0].name
  region                             = var.region
  nat_ip_allocate_option             = var.nat_static_ip_count > 0 ? "MANUAL_ONLY" : "AUTO_ONLY"
  nat_ips                            = google_compute_address.nat[*].self_link
  source_subnetwork_ip_ranges_to_nat = "LIST_OF_SUBNETWORKS"

  subnetwork {
    name                    = google_compute_subnetwork.run.id
    source_ip_ranges_to_nat = ["ALL_IP_RANGES"]
  }

  enable_dynamic_port_allocation      = true
  enable_endpoint_independent_mapping = false
  min_ports_per_vm                    = 64
  max_ports_per_vm                    = 4096

  log_config {
    enable = true
    filter = "ERRORS_ONLY"
  }
}
