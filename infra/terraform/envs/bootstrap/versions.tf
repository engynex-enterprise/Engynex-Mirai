terraform {
  required_version = ">= 1.9.0"

  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 8.9"
    }
    google-beta = {
      source  = "hashicorp/google-beta"
      version = "~> 8.9"
    }
  }

  # El bootstrap crea el bucket del estado, así que su primer `apply` usa estado local.
  # Después: cp backend.tf.example backend.tf && terraform init -migrate-state (docs/infra/runbook.md §1).
}

provider "google" {
  region                = var.region
  user_project_override = true
  billing_project       = var.projects.cicd
  default_labels = {
    app            = "mirai"
    gestionado-por = "terraform"
  }
}

provider "google-beta" {
  region                = var.region
  user_project_override = true
  billing_project       = var.projects.cicd
  default_labels = {
    app            = "mirai"
    gestionado-por = "terraform"
  }
}
