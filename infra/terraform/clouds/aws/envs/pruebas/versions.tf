terraform {
  required_version = ">= 1.9.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = ">= 6.0, < 7.0"
    }
    random = {
      source  = "hashicorp/random"
      version = ">= 3.6, < 4.0"
    }
  }

  # Estado remoto en S3 con bloqueo nativo (use_lockfile: archivo .tflock, sin DynamoDB). El bucket va aparte:
  #   cp backend.hcl.example backend.hcl && terraform init -backend-config=backend.hcl
  backend "s3" {
    key          = "envs/pruebas/terraform.tfstate"
    use_lockfile = true
    encrypt      = true
  }
}

provider "aws" {
  region = var.region
  default_tags {
    tags = {
      app            = "mirai"
      ambiente       = "pruebas"
      gestionado-por = "terraform"
    }
  }
}

# CloudFront exige el certificado de ACM, el WAF y las métricas de Route 53 en us-east-1.
provider "aws" {
  alias  = "us_east_1"
  region = "us-east-1"
  default_tags {
    tags = {
      app            = "mirai"
      ambiente       = "pruebas"
      gestionado-por = "terraform"
    }
  }
}
