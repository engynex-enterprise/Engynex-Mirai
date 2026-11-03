# Variables propias de Azure (las comunes están en variables-comunes.tf, idéntico en las tres nubes).

variable "azure" {
  description = <<-EOT
    Datos de Azure del ambiente:
    subscription_id, tenant_id: la suscripción y el tenant de Entra ID.
    resource_group_name: grupo del ambiente (por defecto mirai-<ambiente>-rg). create_resource_group = false si ya lo
      creó el bootstrap (así los permisos de despliegue se asignan antes de que exista el stack).
    registry_server / registry_id: ACR del bootstrap (login server e id). Con registry_id se da AcrPull a las
      identidades de los servicios.
    queue_driver: servicebus (Service Bus + MODE=worker) o http (la API se despacha a sí misma, sin cola ni worker;
      la API no acepta QUEUE_DRIVER=pg).
    openai_endpoint: Azure OpenAI de la plataforma (AI_PLATFORM_PROVIDER=azure, identidad administrada).
    private_link: Front Door entra a las apps por Private Link (entorno de Container Apps interno).
    zone_redundant: entorno de Container Apps repartido en zonas (producción).
    key_vault_name, servicebus_namespace, storage_account_names: nombres únicos en Azure si los por defecto chocan.
    postgres_zone: zona del servidor de Postgres.
  EOT
  type = object({
    subscription_id       = string
    tenant_id             = string
    resource_group_name   = optional(string)
    create_resource_group = optional(bool, true)
    registry_server       = optional(string)
    registry_id           = optional(string)
    queue_driver          = optional(string, "servicebus")
    openai_endpoint       = optional(string)
    private_link          = optional(bool, false)
    zone_redundant        = optional(bool, false)
    key_vault_name        = optional(string)
    servicebus_namespace  = optional(string)
    storage_account_names = optional(map(string), {})
    postgres_zone         = optional(string, "1")
  })
  validation {
    condition     = contains(["servicebus", "http"], var.azure.queue_driver)
    error_message = "azure.queue_driver debe ser servicebus o http."
  }
}
