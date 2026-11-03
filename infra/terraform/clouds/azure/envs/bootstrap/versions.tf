terraform {
  required_version = ">= 1.9.0"

  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "~> 5.12"
    }
    azuread = {
      source  = "hashicorp/azuread"
      version = "~> 3.6"
    }
  }

  # El bootstrap crea la cuenta del estado, así que su primer `apply` usa estado local.
  # Después: cp backend.tf.example backend.tf && terraform init -migrate-state.
}

provider "azurerm" {
  subscription_id     = var.subscription_id
  tenant_id           = var.tenant_id
  storage_use_azuread = true
  features {}
}

provider "azuread" {
  tenant_id = var.tenant_id
}
