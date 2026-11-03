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

  # Estado remoto en GCS (bloqueo nativo con .tflock). El bucket va aparte:
  #   terraform init -backend-config=backend.hcl
  backend "gcs" {
    prefix = "envs/pruebas"
  }
}

provider "google" {
  project               = var.project_id
  region                = var.region
  user_project_override = true
  billing_project       = var.project_id
  default_labels = {
    app            = "mirai"
    ambiente       = "pruebas"
    gestionado-por = "terraform"
  }
}

provider "google-beta" {
  project               = var.project_id
  region                = var.region
  user_project_override = true
  billing_project       = var.project_id
  default_labels = {
    app            = "mirai"
    ambiente       = "pruebas"
    gestionado-por = "terraform"
  }
}

# Proyecto compartido de CI/CD: cuenta de despliegue, disparadores y permisos sobre Artifact Registry.
provider "google" {
  alias                 = "cicd"
  project               = var.cicd_project_id
  region                = var.region
  user_project_override = true
  billing_project       = var.cicd_project_id
  default_labels = {
    app            = "mirai"
    ambiente       = "pruebas"
    gestionado-por = "terraform"
  }
}
