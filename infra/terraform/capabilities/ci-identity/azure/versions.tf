terraform {
  required_version = ">= 1.9.0"
  required_providers {
    azuread = {
      source  = "hashicorp/azuread"
      version = ">= 3.6.0, < 4.0.0"
    }
  }
}
