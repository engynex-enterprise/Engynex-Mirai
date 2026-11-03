# Pruebas del stack de Azure sin nube: `cd infra/terraform/clouds/azure/stack && terraform init -backend=false && terraform test`.
# Los proveedores son simulados (mock_provider): se revisan expresiones, claves de for_each, validaciones, variables de
# la app y lo que se crea en cada combinación de piezas, sin credenciales ni costos. Los ids simulados tienen forma de
# id de Azure para que las referencias entre recursos sean realistas.

mock_provider "azurerm" {
  mock_data "azurerm_client_config" {
    defaults = {
      object_id       = "11111111-1111-1111-1111-111111111111"
      tenant_id       = "00000000-0000-0000-0000-000000000001"
      subscription_id = "00000000-0000-0000-0000-000000000000"
    }
  }
  mock_data "azurerm_resource_group" {
    defaults = {
      id = "/subscriptions/00000000-0000-0000-0000-000000000000/resourceGroups/mirai-pruebas-rg"
    }
  }
  mock_resource "azurerm_resource_group" {
    defaults = {
      id = "/subscriptions/00000000-0000-0000-0000-000000000000/resourceGroups/mirai-pruebas-rg"
    }
  }
  mock_resource "azurerm_container_app_environment" {
    defaults = {
      id             = "/subscriptions/00000000-0000-0000-0000-000000000000/resourceGroups/mirai-pruebas-rg/providers/Microsoft.App/managedEnvironments/mirai-pruebas-aca"
      default_domain = "ejemplo.eastus2.azurecontainerapps.io"
    }
  }
  mock_resource "azurerm_user_assigned_identity" {
    defaults = {
      id           = "/subscriptions/00000000-0000-0000-0000-000000000000/resourceGroups/mirai-pruebas-rg/providers/Microsoft.ManagedIdentity/userAssignedIdentities/mirai-pruebas-x"
      principal_id = "22222222-2222-2222-2222-222222222222"
      client_id    = "33333333-3333-3333-3333-333333333333"
    }
  }
  mock_resource "azurerm_key_vault" {
    defaults = {
      id        = "/subscriptions/00000000-0000-0000-0000-000000000000/resourceGroups/mirai-pruebas-rg/providers/Microsoft.KeyVault/vaults/mirai-pruebas-abcde"
      vault_uri = "https://mirai-pruebas-abcde.vault.azure.net/"
    }
  }
  mock_resource "azurerm_key_vault_secret" {
    defaults = {
      versionless_id          = "https://mirai-pruebas-abcde.vault.azure.net/secrets/secreto"
      resource_versionless_id = "/subscriptions/00000000-0000-0000-0000-000000000000/resourceGroups/mirai-pruebas-rg/providers/Microsoft.KeyVault/vaults/mirai-pruebas-abcde/secrets/secreto"
    }
  }
  mock_resource "azurerm_servicebus_queue" {
    defaults = {
      id = "/subscriptions/00000000-0000-0000-0000-000000000000/resourceGroups/mirai-pruebas-rg/providers/Microsoft.ServiceBus/namespaces/mirai-pruebas-sb-abcdef/queues/notify"
    }
  }
  mock_resource "azurerm_cdn_frontdoor_endpoint" {
    defaults = {
      id        = "/subscriptions/00000000-0000-0000-0000-000000000000/resourceGroups/mirai-pruebas-rg/providers/Microsoft.Cdn/profiles/fd/afdEndpoints/ep"
      host_name = "mirai-pruebas-abc123.z01.azurefd.net"
    }
  }
  mock_resource "azurerm_cdn_frontdoor_custom_domain" {
    defaults = {
      id               = "/subscriptions/00000000-0000-0000-0000-000000000000/resourceGroups/mirai-pruebas-rg/providers/Microsoft.Cdn/profiles/fd/customDomains/cd"
      validation_token = "token-de-validacion"
    }
  }
  mock_resource "azurerm_storage_account" {
    defaults = {
      id                    = "/subscriptions/00000000-0000-0000-0000-000000000000/resourceGroups/mirai-pruebas-rg/providers/Microsoft.Storage/storageAccounts/cuenta"
      primary_blob_host     = "cuenta.blob.core.windows.net"
      primary_blob_endpoint = "https://cuenta.blob.core.windows.net/"
    }
  }
  mock_resource "azurerm_postgresql_flexible_server" {
    defaults = {
      id   = "/subscriptions/00000000-0000-0000-0000-000000000000/resourceGroups/mirai-pruebas-rg/providers/Microsoft.DBforPostgreSQL/flexibleServers/pg"
      fqdn = "mirai-pruebas-pg.mirai-pruebas.private.postgres.database.azure.com"
    }
  }
  mock_resource "azurerm_redis_cache" {
    defaults = {
      id                 = "/subscriptions/00000000-0000-0000-0000-000000000000/resourceGroups/mirai-pruebas-rg/providers/Microsoft.Cache/redis/redis"
      hostname           = "mirai-pruebas-redis.redis.cache.windows.net"
      ssl_port           = 6380
      primary_access_key = "clave/de+prueba="
    }
  }
  mock_resource "azurerm_virtual_network" {
    defaults = {
      id = "/subscriptions/00000000-0000-0000-0000-000000000000/resourceGroups/mirai-pruebas-rg/providers/Microsoft.Network/virtualNetworks/vnet"
    }
  }
  mock_resource "azurerm_subnet" {
    defaults = {
      id = "/subscriptions/00000000-0000-0000-0000-000000000000/resourceGroups/mirai-pruebas-rg/providers/Microsoft.Network/virtualNetworks/vnet/subnets/aca"
    }
  }
  mock_resource "azurerm_public_ip" {
    defaults = {
      id = "/subscriptions/00000000-0000-0000-0000-000000000000/resourceGroups/mirai-pruebas-rg/providers/Microsoft.Network/publicIPAddresses/nat"
    }
  }
  mock_resource "azurerm_nat_gateway" {
    defaults = {
      id = "/subscriptions/00000000-0000-0000-0000-000000000000/resourceGroups/mirai-pruebas-rg/providers/Microsoft.Network/natGateways/nat"
    }
  }
  mock_resource "azurerm_private_dns_zone" {
    defaults = {
      id = "/subscriptions/00000000-0000-0000-0000-000000000000/resourceGroups/mirai-pruebas-rg/providers/Microsoft.Network/privateDnsZones/privatelink.redis.cache.windows.net"
    }
  }
  mock_resource "azurerm_log_analytics_workspace" {
    defaults = {
      id = "/subscriptions/00000000-0000-0000-0000-000000000000/resourceGroups/mirai-pruebas-rg/providers/Microsoft.OperationalInsights/workspaces/logs"
    }
  }
  mock_resource "azurerm_container_app" {
    defaults = {
      id = "/subscriptions/00000000-0000-0000-0000-000000000000/resourceGroups/mirai-pruebas-rg/providers/Microsoft.App/containerApps/app"
    }
  }
  mock_resource "azurerm_container_app_job" {
    defaults = {
      id = "/subscriptions/00000000-0000-0000-0000-000000000000/resourceGroups/mirai-pruebas-rg/providers/Microsoft.App/jobs/job"
    }
  }
  mock_resource "azurerm_servicebus_namespace" {
    defaults = {
      id = "/subscriptions/00000000-0000-0000-0000-000000000000/resourceGroups/mirai-pruebas-rg/providers/Microsoft.ServiceBus/namespaces/sb"
    }
  }
  mock_resource "azurerm_cdn_frontdoor_profile" {
    defaults = {
      id = "/subscriptions/00000000-0000-0000-0000-000000000000/resourceGroups/mirai-pruebas-rg/providers/Microsoft.Cdn/profiles/fd"
    }
  }
  mock_resource "azurerm_cdn_frontdoor_origin_group" {
    defaults = {
      id = "/subscriptions/00000000-0000-0000-0000-000000000000/resourceGroups/mirai-pruebas-rg/providers/Microsoft.Cdn/profiles/fd/originGroups/og"
    }
  }
  mock_resource "azurerm_cdn_frontdoor_origin" {
    defaults = {
      id = "/subscriptions/00000000-0000-0000-0000-000000000000/resourceGroups/mirai-pruebas-rg/providers/Microsoft.Cdn/profiles/fd/originGroups/og/origins/o"
    }
  }
  mock_resource "azurerm_cdn_frontdoor_route" {
    defaults = {
      id = "/subscriptions/00000000-0000-0000-0000-000000000000/resourceGroups/mirai-pruebas-rg/providers/Microsoft.Cdn/profiles/fd/afdEndpoints/ep/routes/r"
    }
  }
  mock_resource "azurerm_cdn_frontdoor_firewall_policy" {
    defaults = {
      id = "/subscriptions/00000000-0000-0000-0000-000000000000/resourceGroups/mirai-pruebas-rg/providers/Microsoft.Network/frontDoorWebApplicationFirewallPolicies/waf"
    }
  }
  mock_resource "azurerm_application_insights" {
    defaults = {
      id = "/subscriptions/00000000-0000-0000-0000-000000000000/resourceGroups/mirai-pruebas-rg/providers/Microsoft.Insights/components/ai"
    }
  }
  mock_resource "azurerm_application_insights_standard_web_test" {
    defaults = {
      id = "/subscriptions/00000000-0000-0000-0000-000000000000/resourceGroups/mirai-pruebas-rg/providers/Microsoft.Insights/webTests/wt"
    }
  }
  mock_resource "azurerm_monitor_action_group" {
    defaults = {
      id = "/subscriptions/00000000-0000-0000-0000-000000000000/resourceGroups/mirai-pruebas-rg/providers/Microsoft.Insights/actionGroups/ag"
    }
  }
  mock_resource "azurerm_dns_zone" {
    defaults = {
      id = "/subscriptions/00000000-0000-0000-0000-000000000000/resourceGroups/mirai-pruebas-rg/providers/Microsoft.Network/dnsZones/mirai.engynex.com"
    }
  }
}

mock_provider "azapi" {}

mock_provider "random" {}

variables {
  environment   = "pruebas"
  region        = "eastus2"
  bucket_suffix = "engynex"
  domains = {
    web                       = "pruebas.mirai.engynex.com"
    api                       = "api.pruebas.mirai.engynex.com"
    realtime                  = "rt.pruebas.mirai.engynex.com"
    files                     = "files.pruebas.mirai.engynex.com"
    canary_web                = "canary.pruebas.mirai.engynex.com"
    canary_api                = "canary-api.pruebas.mirai.engynex.com"
    certificate               = ["pruebas.mirai.engynex.com", "*.pruebas.mirai.engynex.com"]
    dns_authorization_domains = ["pruebas.mirai.engynex.com"]
  }
  network      = { cidr = "10.30.0.0/16" }
  alert_emails = { dueno = "alertas@engynex.com" }
  public_config = {
    GOOGLE_CLIENT_ID = "cliente.apps.googleusercontent.com"
    VAPID_SUBJECT    = "mailto:soporte@engynex.com"
  }
  features = {
    postgres = true
    realtime = true
    worker   = true
  }
  services = {
    realtime = { min_instances = 0, max_instances = 1 }
  }
  deletion_protection = false
  azure = {
    subscription_id = "00000000-0000-0000-0000-000000000000"
    tenant_id       = "00000000-0000-0000-0000-000000000001"
    registry_server = "miraiabcdef12.azurecr.io"
    registry_id     = "/subscriptions/00000000-0000-0000-0000-000000000000/resourceGroups/mirai-cicd-rg/providers/Microsoft.ContainerRegistry/registries/miraiabcdef12"
  }
}

run "pruebas_minimo" {
  command = apply

  assert {
    condition = alltrue([
      module.app.env.api.MODE == "api",
      module.app.env.api.DB_ADAPTER == "pg",
      module.app.env.api.AUTH_PROVIDER == "mirai",
      module.app.env.api.QUEUE_DRIVER == "servicebus",
      module.app.env.api.QUEUE_NOTIFY == "notify",
      module.app.env.api.SECRETS_SOURCE == "env",
      module.app.env.api.OBJECT_STORE == "azure-blob",
      module.app.env.api.AZURE_STORAGE_CONTAINER == "objetos",
      module.app.env.api.API_BASE_URL == "https://mirai-pruebas-api.internal.ejemplo.eastus2.azurecontainerapps.io",
      module.app.env.worker.MODE == "worker",
      module.app.env.worker.QUEUE_DRIVER == "servicebus",
      module.app.env.realtime.MODE == "realtime",
      !contains(keys(module.app.env.realtime), "QUEUE_DRIVER"),
    ])
    error_message = "Variables de la API en Azure (Postgres de la nube, Better Auth, Service Bus, Blob)."
  }

  assert {
    condition     = length(module.redis) == 0 && length(module.queue.queue_names) == 3 && length(module.postgres) == 1
    error_message = "En pruebas: Postgres y Service Bus (la API no acepta cola en Postgres); sin Redis."
  }

  assert {
    condition     = toset(keys(module.service)) == toset(["web", "api", "realtime", "worker"])
    error_message = "Servicios: web, api, realtime y worker (sin postgrest)."
  }

  assert {
    condition     = contains(keys(local.secret_env["api"]), "DATABASE_URL") && contains(keys(local.secret_env["api"]), "BETTER_AUTH_SECRET") && !contains(keys(local.secret_env["api"]), "SUPABASE_SECRET_KEY")
    error_message = "La API monta la base y Better Auth, no Supabase."
  }

  assert {
    condition     = local.migrate_secrets["DATABASE_URL"] == "database-admin-url" && local.migrate_secrets["MIRAI_APP_DATABASE_URL"] == "database-url"
    error_message = "db-migrate entra como administrador y recibe la URL de la app para crear su rol."
  }

  assert {
    condition     = contains(local.secret_readers["database-url"], "migrate") && contains(local.secret_readers["database-url"], "worker")
    error_message = "Los permisos de Key Vault cubren al worker y a las migraciones."
  }

  assert {
    condition     = length(module.app.routes) == 2 && module.app.routes[1].origin == "realtime"
    error_message = "Rutas del mismo origen: /v1 y /api/auth a la API, /socket.io al gateway."
  }

  assert {
    condition     = output.ci_variables.MIRAI_CLOUD == "azure" && output.ci_variables.MIRAI_CANARY_API_URL == "https://mirai-pruebas-api---canary.ejemplo.eastus2.azurecontainerapps.io" && output.ci_variables.AZURE_ACR_NAME == "miraiabcdef12" && output.ci_variables.MIRAI_MIGRATE_JOB == "mirai-pruebas-db-migrate"
    error_message = "Variables de GitHub para desplegar en Azure."
  }

  assert {
    condition     = output.ci_variables.MIRAI_REGISTRY == "miraiabcdef12.azurecr.io/mirai" && strcontains(output.ci_variables.WEB_BUILD_ENV, "NEXT_PUBLIC_API_URL=https://pruebas.mirai.engynex.com")
    error_message = "Registro y build de la web."
  }

  assert {
    condition     = length(module.service["realtime"].edge_origin) > 0 && module.service["realtime"].edge_origin.session_affinity
    error_message = "El gateway pide afinidad de sesión."
  }

  assert {
    condition     = length(module.edge) == 1 && length(output.dns_records) == 8
    error_message = "Front Door con 4 dominios (web, api, rt, files): un TXT y un CNAME cada uno."
  }

  assert {
    condition     = module.scheduler.job_ids != null && length(module.scheduler.job_ids) == 2
    error_message = "Cron: tick y drain."
  }
}

run "produccion_completo" {
  command = apply

  variables {
    environment = "produccion"
    features = {
      postgres         = true
      redis            = true
      realtime         = true
      postgrest        = true
      worker           = true
      scheduler_paused = false
      uptime_checks    = true
      dns              = true
    }
    db_adapter = "postgrest"
    services = {
      web      = { min_instances = 1, max_instances = 20 }
      api      = { min_instances = 1, max_instances = 20 }
      realtime = { min_instances = 1, max_instances = 6 }
    }
    postgres = { size = "m", high_availability = true, backup_days = 30 }
    redis    = { high_availability = true }
    dns      = { zone_name = "mirai.engynex.com" }
    domains = {
      web                       = "mirai.engynex.com"
      api                       = "api.mirai.engynex.com"
      realtime                  = "rt.mirai.engynex.com"
      files                     = "files.mirai.engynex.com"
      canary_web                = "canary.mirai.engynex.com"
      canary_api                = "canary-api.mirai.engynex.com"
      certificate               = ["mirai.engynex.com", "*.mirai.engynex.com"]
      dns_authorization_domains = ["mirai.engynex.com"]
    }
    deletion_protection = true
    azure = {
      subscription_id       = "00000000-0000-0000-0000-000000000000"
      tenant_id             = "00000000-0000-0000-0000-000000000001"
      create_resource_group = false
      queue_driver          = "servicebus"
      zone_redundant        = true
      registry_server       = "miraiabcdef12.azurecr.io"
    }
  }

  assert {
    condition     = length(module.redis) == 1 && contains(keys(local.secret_env["realtime"]), "REDIS_URL") && module.app.env.api.REALTIME_API_EMIT == "1"
    error_message = "Con Redis el gateway y la API montan REDIS_URL."
  }

  assert {
    condition = alltrue([
      module.app.env.api.QUEUE_DRIVER == "servicebus",
      module.app.env.api.SERVICEBUS_NAMESPACE == "mirai-produccion-sb-${substr(md5("00000000-0000-0000-0000-000000000000/mirai-produccion-rg"), 0, 6)}.servicebus.windows.net",
      module.app.env.worker.QUEUE_NOTIFY == "notify",
      module.app.env.api.DB_ADAPTER == "postgrest",
      module.app.env.api.POSTGREST_URL == "https://mirai-produccion-postgrest.internal.ejemplo.eastus2.azurecontainerapps.io",
    ])
    error_message = "Service Bus y PostgREST llegan a la API y al worker."
  }

  assert {
    condition     = local.secret_env["postgrest"]["PGRST_JWT_SECRET"] != null && contains(keys(local.secret_env["postgrest"]), "PGRST_DB_URI") && local.migrate_secrets["MIRAI_POSTGREST_DATABASE_URL"] == "postgrest-db-uri"
    error_message = "PostgREST monta su conexión y su JWT; db-migrate recibe la de authenticator."
  }

  assert {
    condition     = toset(keys(module.service)) == toset(["web", "api", "realtime", "worker", "postgrest"]) && length(module.dns) == 1
    error_message = "Producción con todas las piezas y zona DNS."
  }

  assert {
    condition     = length(azurerm_role_assignment.acr_pull) == 0 && length(azurerm_resource_group.this) == 0
    error_message = "Sin registry_id no se asigna AcrPull; el grupo lo creó el bootstrap."
  }
}

run "realtime_sin_redis_falla" {
  command = plan

  variables {
    features = {
      realtime = true
      redis    = false
      worker   = true
    }
    services = {
      realtime = { max_instances = 3 }
    }
  }

  expect_failures = [var.features]
}

run "cola_invalida_falla" {
  command = plan

  variables {
    azure = {
      subscription_id = "00000000-0000-0000-0000-000000000000"
      tenant_id       = "00000000-0000-0000-0000-000000000001"
      queue_driver    = "sqs"
    }
  }

  expect_failures = [var.azure]
}

run "despacho_http_y_otel" {
  command = plan

  variables {
    features = {
      postgres = true
      realtime = true
      worker   = false
      otel     = true
    }
    azure = {
      subscription_id = "00000000-0000-0000-0000-000000000000"
      tenant_id       = "00000000-0000-0000-0000-000000000001"
      queue_driver    = "http"
      openai_endpoint = "https://mirai.openai.azure.com"
    }
  }

  assert {
    condition     = module.app.env.api.QUEUE_DRIVER == "http" && length(module.queue.queue_names) == 0 && !contains(keys(module.service), "worker")
    error_message = "Con queue_driver = http no hay Service Bus ni worker."
  }

  assert {
    condition     = module.app.env.api.AI_PLATFORM_PROVIDER == "azure" && module.app.env.api.AZURE_OPENAI_ENDPOINT == "https://mirai.openai.azure.com" && module.app.env.api.OTEL_TRACES_EXPORTER == "otlp"
    error_message = "Azure OpenAI primero y OTEL al colector."
  }

  assert {
    condition     = length(azurerm_application_insights.otel) == 1
    error_message = "El colector manda a su Application Insights."
  }
}
