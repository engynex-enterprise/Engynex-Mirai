terraform {
  required_version = ">= 1.9.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = ">= 6.0, < 7.0"
    }
  }

  # El bootstrap crea el bucket del estado, así que su primer apply usa estado local.
  # Después: cp backend.hcl.example backend.hcl, descomenta el bloque backend "s3" y
  # terraform init -backend-config=backend.hcl -migrate-state.
  # backend "s3" {
  #   key          = "bootstrap/terraform.tfstate"
  #   use_lockfile = true
  #   encrypt      = true
  # }
}

provider "aws" {
  region = var.region
  default_tags {
    tags = {
      app            = "mirai"
      gestionado-por = "terraform"
    }
  }
}
