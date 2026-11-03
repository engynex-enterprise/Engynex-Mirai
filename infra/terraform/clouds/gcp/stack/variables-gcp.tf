# Variables propias de GCP (lo común está en variables-comunes.tf, idéntico en las tres nubes).

variable "project_id" {
  description = "Proyecto de GCP del ambiente."
  type        = string
  validation {
    condition     = can(regex("^[a-z][a-z0-9-]{4,28}[a-z0-9]$", var.project_id))
    error_message = "ID de proyecto no válido."
  }
}

variable "cicd_project_id" {
  description = "Proyecto compartido de CI/CD (Artifact Registry, Cloud Build, Workload Identity Federation, estado de Terraform)."
  type        = string
}

variable "gcp" {
  description = <<-EOT
    Ajustes de GCP:
    - vertex_ai / vertex_location: proveedor de IA de la plataforma sin llave (D13): roles/aiplatform.user para la API
      y GOOGLE_VERTEX_PROJECT/LOCATION.
    - api_vpc_egress: salida de la API por la VPC (ALL_TRAFFIC se fuerza con PostgREST: llega a *.run.app interno).
    - cloud_sql_edition: ENTERPRISE o ENTERPRISE_PLUS.
    - identity_platform: adaptador opcional (§3.1.9); enabled = true solo crea la configuración de Identity Platform.
      La API de hoy no lo usa (AUTH_PROVIDER acepta mirai o supabase).
    - github_actions: deja que GitHub Actions use la cuenta de despliegue del ambiente por WIF (pool = salida
      workload_identity_pool del bootstrap; principal = attribute.environment/<environment> o attribute.ref/<ref>).
  EOT
  type = object({
    vertex_ai         = optional(bool, true)
    vertex_location   = optional(string, "us-central1")
    api_vpc_egress    = optional(string, "PRIVATE_RANGES_ONLY")
    cloud_sql_edition = optional(string, "ENTERPRISE")
    identity_platform = optional(object({
      enabled          = optional(bool, false)
      google_client_id = optional(string)
      totp_mfa         = optional(bool, true)
    }), {})
    github_actions = optional(object({
      workload_identity_pool = string
      environment            = optional(string)
      ref                    = optional(string)
    }))
  })
  default = {}
  validation {
    condition     = contains(["PRIVATE_RANGES_ONLY", "ALL_TRAFFIC"], var.gcp.api_vpc_egress)
    error_message = "gcp.api_vpc_egress debe ser PRIVATE_RANGES_ONLY o ALL_TRAFFIC."
  }
}

variable "cicd" {
  description = "Registro de imágenes y, como alternativa a GitHub Actions, disparadores de Cloud Build (repository_id null = sin disparadores)."
  type = object({
    artifact_registry_path = string
    artifact_registry_repo = string
    location               = optional(string, "us-east1")
    repository_id          = optional(string)
    branch_regex           = string
    approval_required      = optional(bool, false)
    fail_on_severity       = optional(string, "CRITICAL")
    canary_steps           = optional(string, "10,50")
    bake_seconds           = optional(number, 300)
    max_5xx_ratio          = optional(string, "0.02")
    smoke_tests            = optional(bool, true) # false solo hasta que el certificado y los A de canary-* existan
  })
  validation {
    condition     = can(regex("^[a-z0-9-]+-docker\\.pkg\\.dev/[a-z0-9-]+/[a-z0-9-]+$", var.cicd.artifact_registry_path))
    error_message = "cicd.artifact_registry_path debe tener la forma <región>-docker.pkg.dev/<proyecto>/<repo>."
  }
}
