# Bootstrap de Mirai en Azure (se aplica una vez, a mano, con una cuenta Owner de la suscripción y permiso para crear
# aplicaciones en Entra ID):
# 1. grupos de recursos: CI/CD (estado + ACR) y uno por ambiente (así los permisos de despliegue existen antes que el
#    stack; los ambientes usan create_resource_group = false);
# 2. cuenta de almacenamiento del estado (contenedor tfstate, versionado, borrado suave, sin claves compartidas);
# 3. Azure Container Registry compartido;
# 4. identidades de GitHub Actions por OIDC (sin secretos) y sus permisos:
#    - mirai-tf-plan: Reader de la suscripción + lectura del estado (plan en PR; no lee valores de Key Vault, así que el
#      plan corre con -refresh=false o con permiso de lectura de secretos si se quiere refrescar).
#    - mirai-tf-pruebas / mirai-tf-produccion: Contributor + Role Based Access Control Administrator sobre la suscripción
#      (crean recursos y asignan roles a las identidades administradas) + escritura del estado. Producción solo desde el
#      entorno de GitHub `produccion` (revisores obligatorios). Para acotarlos, cambia el alcance a los grupos de
#      recursos (pierde la creación de grupos nuevos).
#    - mirai-deploy-pruebas / mirai-deploy-produccion: Contributor del grupo de SU ambiente (az containerapp update,
#      revisiones, tráfico y jobs) + AcrPush en el registro. No pueden tocar el otro ambiente.
# El contexto de las capacidades exige un ambiente: el bootstrap usa "produccion" (protecciones de producción).

data "azurerm_subscription" "current" {}

locals {
  labels = { app = "mirai", gestionado-por = "terraform" }
  sub_id = data.azurerm_subscription.current.id

  context = {
    prefix      = "mirai-cicd"
    environment = "produccion"
    region      = var.region
    labels      = local.labels
    cloud = {
      resource_group_name = azurerm_resource_group.cicd.name
      resource_group_id   = azurerm_resource_group.cicd.id
      subscription_id     = var.subscription_id
      tenant_id           = var.tenant_id
    }
  }

  envs = { pruebas = "mirai-pruebas-rg", produccion = "mirai-produccion-rg" }
}

# ── 1. Grupos de recursos ──────────────────────────────────────────────────────────────────────────────────────
resource "azurerm_resource_group" "cicd" {
  name     = var.cicd_resource_group_name
  location = var.region
  tags     = merge(local.labels, { proposito = "cicd" })

  lifecycle {
    prevent_destroy = true
  }
}

resource "azurerm_resource_group" "env" {
  for_each = local.envs
  name     = each.value
  location = var.region
  tags     = merge(local.labels, { ambiente = each.key })

  lifecycle {
    prevent_destroy = true
  }
}

# ── 2. Estado remoto ───────────────────────────────────────────────────────────────────────────────────────────
resource "azurerm_storage_account" "state" {
  name                            = var.state_storage_account_name
  resource_group_name             = azurerm_resource_group.cicd.name
  location                        = var.region
  account_kind                    = "StorageV2"
  account_tier                    = "Standard"
  account_replication_type        = "ZRS"
  min_tls_version                 = "TLS1_2"
  https_traffic_only_enabled      = true
  shared_access_key_enabled       = false # solo Entra ID (use_azuread_auth en los backends)
  default_to_oauth_authentication = true
  allow_nested_items_to_be_public = false
  tags                            = merge(local.labels, { proposito = "terraform-state" })

  blob_properties {
    versioning_enabled = true
    delete_retention_policy {
      days = 30
    }
    container_delete_retention_policy {
      days = 30
    }
  }

  lifecycle {
    prevent_destroy = true
  }
}

resource "azurerm_storage_container" "state" {
  name                  = "tfstate"
  storage_account_id    = azurerm_storage_account.state.id
  container_access_type = "private"
}

# Quien aplica el bootstrap escribe el contenedor por el plano de datos.
data "azurerm_client_config" "current" {}

resource "azurerm_role_assignment" "state_admin" {
  scope                = azurerm_storage_account.state.id
  role_definition_name = "Storage Blob Data Owner"
  principal_id         = data.azurerm_client_config.current.object_id
}

# ── 3. Registro de imágenes ────────────────────────────────────────────────────────────────────────────────────
module "registry" {
  source        = "../../../../capabilities/registry/azure"
  context       = local.context
  name          = "mirai"
  images        = ["web", "api"]
  cloud_options = merge({ sku = var.registry_sku }, var.registry_name == null ? {} : { registry_name = var.registry_name })
  writers       = { for k in ["mirai-deploy-pruebas", "mirai-deploy-produccion"] : k => module.ci.principals[k] }
}

# ── 4. GitHub Actions por OIDC ─────────────────────────────────────────────────────────────────────────────────
module "ci" {
  source  = "../../../../capabilities/ci-identity/azure"
  context = local.context
  github = {
    owner         = var.github_owner
    repository    = var.github_repository
    repository_id = var.github_repository_id
  }

  roles = {
    "mirai-tf-plan" = {
      display_name  = "Terraform plan (solo lectura, PR y ramas)"
      pull_requests = true
      refs          = ["refs/heads/pruebas", "refs/heads/main"]
    }
    "mirai-tf-pruebas" = {
      display_name = "Terraform apply en pruebas"
      refs         = ["refs/heads/pruebas", "refs/heads/main"]
      environments = ["pruebas"]
    }
    "mirai-tf-produccion" = {
      display_name = "Terraform apply en producción (solo el entorno produccion de GitHub)"
      environments = ["produccion"]
    }
    "mirai-deploy-pruebas" = {
      display_name = "Despliegue en pruebas (rama pruebas)"
      refs         = ["refs/heads/pruebas"]
      environments = ["pruebas"]
    }
    "mirai-deploy-produccion" = {
      display_name = "Despliegue en producción (entorno produccion con revisores)"
      environments = ["produccion"]
    }
  }
}

locals {
  p = module.ci.principals

  assignments = merge(
    {
      "plan/reader"       = { scope = local.sub_id, role = "Reader", principal = local.p["mirai-tf-plan"] }
      "plan/state"        = { scope = azurerm_storage_account.state.id, role = "Storage Blob Data Reader", principal = local.p["mirai-tf-plan"] }
      "deploy-pruebas"    = { scope = azurerm_resource_group.env["pruebas"].id, role = "Contributor", principal = local.p["mirai-deploy-pruebas"] }
      "deploy-produccion" = { scope = azurerm_resource_group.env["produccion"].id, role = "Contributor", principal = local.p["mirai-deploy-produccion"] }
    },
    merge([for env in keys(local.envs) : {
      "tf-${env}/contributor" = { scope = local.sub_id, role = "Contributor", principal = local.p["mirai-tf-${env}"] }
      "tf-${env}/rbac"        = { scope = local.sub_id, role = "Role Based Access Control Administrator", principal = local.p["mirai-tf-${env}"] }
      "tf-${env}/state"       = { scope = azurerm_storage_account.state.id, role = "Storage Blob Data Contributor", principal = local.p["mirai-tf-${env}"] }
    }]...),
  )
}

resource "azurerm_role_assignment" "ci" {
  for_each             = local.assignments
  scope                = each.value.scope
  role_definition_name = each.value.role
  principal_id         = each.value.principal
  principal_type       = "ServicePrincipal"
}

# ── Presupuesto del grupo de CI/CD ─────────────────────────────────────────────────────────────────────────────
module "budget_cicd" {
  source              = "../../../../capabilities/budget/azure"
  context             = local.context
  name                = "Mirai CI-CD"
  amount              = var.cicd_budget_amount
  notification_emails = { dueno = var.alert_email }
}
