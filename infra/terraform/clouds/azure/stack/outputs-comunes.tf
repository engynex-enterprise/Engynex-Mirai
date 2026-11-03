# Salidas COMUNES del stack (mismos nombres en clouds/{gcp,aws,azure}/stack/outputs-comunes.tf).

output "edge_address" {
  description = "Host del endpoint de Front Door (destino de los CNAME)."
  value       = local.f.edge ? module.edge[0].ip_or_cname : null
}

output "dns_records" {
  description = "Registros a crear en el DNS (Hostinger): TXT _dnsauth primero, CNAME al hacer el corte."
  value       = local.f.edge ? module.edge[0].dns_records : []
}

output "service_urls" {
  description = "URL internas de los servicios (https://<app>.internal.<dominio del entorno>; el worker no tiene)."
  value       = { for k, s in module.service : k => s.internal_url }
}

output "identities" {
  description = "Identidades administradas: clave → { client_id, principal_id }."
  value       = { for k, h in module.identity.handles : k => { client_id = h.client_id, principal_id = h.principal_id } }
}

output "secret_ids" {
  description = "Clave → URL del secreto en Key Vault (para cargar valores con az keyvault secret set)."
  value       = module.secrets.refs
}

output "buckets" {
  description = "Propósito → cuenta de almacenamiento (contenedor objetos)."
  value       = local.f.storage ? module.storage[0].bucket_names : {}
}

output "queues" {
  description = "Colas de Service Bus (vacío con la cola en Postgres)."
  value       = { driver = module.queue.driver, names = module.queue.queue_names }
}

output "scheduler_jobs" {
  description = "Container Apps Jobs del cron."
  value       = module.scheduler.job_ids
}

output "nat_ips" {
  description = "IP fijas de salida (NAT Gateway)."
  value       = module.network.nat_ips
}

output "postgres" {
  description = "Servidor de Postgres (sin claves)."
  value = local.f.postgres ? {
    host            = module.postgres[0].host
    database        = module.postgres[0].database
    connection_name = module.postgres[0].connection_name
  } : null
}

output "redis_host" {
  description = "Host de Azure Cache for Redis."
  value       = local.f.redis ? module.redis[0].host : null
}

output "web_build_env_b64" {
  description = "NEXT_PUBLIC_* del build de la web en base64 (WEB_BUILD_ENV_B64)."
  value       = module.app.web_build_env_b64
}

output "ci_variables" {
  description = "Variables del entorno de GitHub (Settings › Environments › <ambiente> › Variables) para .github/workflows."
  value = {
    MIRAI_CLOUD            = "azure"
    MIRAI_REGISTRY         = local.registry_server == null ? "" : "${local.registry_server}/mirai"
    MIRAI_SERVICE_WEB      = local.names.web
    MIRAI_SERVICE_API      = local.names.api
    MIRAI_SERVICE_REALTIME = local.f.realtime ? local.names.realtime : ""
    MIRAI_SERVICE_WORKER   = local.f.worker ? local.names.worker : ""
    MIRAI_MIGRATE_JOB      = local.f.postgres ? azurerm_container_app_job.migrate[0].name : ""
    MIRAI_CANARY_WEB_URL   = "https://${local.names.web}---canary.${local.domain}"
    MIRAI_CANARY_API_URL   = "https://${local.names.api}---canary.${local.domain}"
    MIRAI_SMOKE_URL        = "https://${var.domains.web}/api/public/version"
    WEB_BUILD_ENV          = module.app.web_build_env_text
    AZURE_RESOURCE_GROUP   = local.rg_name
    AZURE_ACR_NAME         = local.acr_name
  }
}
