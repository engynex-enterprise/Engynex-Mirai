# Variables propias de AWS (lo común está en variables-comunes.tf, idéntico en las tres nubes).
#
# Qué de lo común se interpreta distinto en AWS:
#   - features.worker: en AWS el worker va atado a SQS (no hay colas que empujen por HTTP como Cloud Tasks): con
#     aws.queue_enabled hay worker que consume SQS; sin SQS, QUEUE_DRIVER=http y no hay worker.
#   - network.nat_static_ip_count: los NAT Gateway ya usan IP elásticas fijas (nat_ips).
#   - postgres.pitr_days e iam_users: RDS recupera a un punto en el tiempo dentro de backup_days; sin usuarios IAM.
#   - postgres.tier: clase de RDS exacta (db.m7g.large…), pisa size.
#   - redis.tls: ElastiCache siempre con TLS + AUTH (CA pública).
#   - waf.waf_sensitivity y waf.adaptive_protection: sin equivalente directo en AWS WAF.
#   - budget.billing_scope y currency: AWS Budgets de la cuenta, en USD.
#   - Canarios (canary.*): ECS despliega por reemplazo gradual con circuit breaker y alarma de 5xx (vuelta atrás
#     automática); no hay revisiones etiquetadas, así que no hay dominios canary.

variable "aws" {
  description = "Ajustes de AWS."
  type = object({
    registry_url           = string                # salida registry_url del bootstrap (<cuenta>.dkr.ecr.<región>.amazonaws.com/mirai)
    nat_per_zone           = optional(bool, false) # un NAT por zona (producción)
    queue_enabled          = optional(bool, true)  # true = SQS + worker; false = QUEUE_DRIVER=http (sin cola ni worker)
    bedrock                = optional(bool, true)  # Bedrock como IA de la plataforma (AI_PLATFORM_PROVIDER=bedrock)
    bedrock_region         = optional(string)      # región de Bedrock (por defecto la del ambiente)
    cloudfront_price_class = optional(string, "PriceClass_All")
    fargate_spot           = optional(bool, false)      # FARGATE_SPOT para web y worker (más barato, puede interrumpirse)
    cpu_architecture       = optional(string, "X86_64") # las imágenes del CI son amd64
    log_retention_days     = optional(number, 30)
    wait_for_certificate   = optional(bool, true) # el apply espera a que ACM emita el certificado
    container_insights     = optional(string, "enabled")
  })
  validation {
    condition     = can(regex("^[0-9]{12}\\.dkr\\.ecr\\.[a-z0-9-]+\\.amazonaws\\.com/[a-z0-9-]+$", var.aws.registry_url))
    error_message = "aws.registry_url debe tener la forma <cuenta>.dkr.ecr.<región>.amazonaws.com/<repo>."
  }
}
