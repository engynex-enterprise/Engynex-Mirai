terraform {
  required_version = ">= 1.9.0"
  required_providers {
    google = {
      source                = "hashicorp/google"
      version               = ">= 8.9.0, < 9.0.0"
      configuration_aliases = [google.cicd]
    }
    random = {
      source  = "hashicorp/random"
      version = ">= 3.6.0, < 4.0.0"
    }
  }
}
