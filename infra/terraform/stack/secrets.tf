# Catálogo de secretos. Nombres de variable = los que leen apps/api (core/config/config.schema.ts,
# modules/integrations/services-env.ts, modules/billing/billing.config.ts, modules/realtime/realtime.config.ts) y
# apps/web (.env.example, lib/env.ts). required = se monta siempre (la app no arranca sin él). Los opcionales se montan
# solo cuando están en var.optional_secrets (ya tienen valor). Las claves de las integraciones globales (Resend, Brevo,
# SendGrid, SMTP, WhatsApp/Meta, Telegram, proveedores de IA, AdSense…) NO son variables: viven cifradas en
# platform_integrations con ENCRYPTION_KEY y se configuran en consola › Integraciones globales.

locals {
  secret_catalog = merge({
    "supabase-secret-key" = {
      env         = "SUPABASE_SECRET_KEY", services = ["web", "api", "realtime"], required = true
      description = "Clave secreta de Supabase (salta RLS). Solo servidor."
    }
    "encryption-key" = {
      env         = "ENCRYPTION_KEY", services = ["web", "api", "realtime"], required = true
      description = "AES-256-GCM de las integraciones (32 bytes base64). Copiar EXACTA la de Vercel: no se puede cambiar. realtime la monta porque el esquema del núcleo y /readyz la exigen fuera de local."
    }
    "cron-secret" = {
      env         = "CRON_SECRET", services = ["web", "api"], required = true
      description = "Bearer de /api/cron/notify (web, pg_cron) y respaldo de SchedulerGuard en la API durante la transición (lo principal es OIDC)."
    }
    "google-client-secret" = {
      env         = "GOOGLE_CLIENT_SECRET", services = ["web", "api"], required = false
      description = "OAuth de Google (Gmail solo lectura y Calendar)."
    }
    "google-oauth-state-key" = {
      env         = "GOOGLE_OAUTH_STATE_KEY", services = ["api"], required = false
      description = "HMAC del state de OAuth de Google en la API (32+ caracteres; openssl rand -base64 32). Sin él, /v1/google/connect-url no funciona."
    }
    "ai-gateway-api-key" = {
      env         = "AI_GATEWAY_API_KEY", services = ["web", "api"], required = false
      description = "Vercel AI Gateway (respaldo si no hay fila global en platform_integrations)."
    }
    "vapid-private-key" = {
      env         = "VAPID_PRIVATE_KEY", services = ["web", "api"], required = false
      description = "Web Push: llave privada VAPID (pareja de NEXT_PUBLIC_VAPID_PUBLIC_KEY)."
    }
    "upstash-redis-rest-token" = {
      env         = "UPSTASH_REDIS_REST_TOKEN", services = ["web"], required = false
      description = "Upstash Redis REST (límite de IA por hogar en la web; la API no lo lee)."
    }
    "mercadopago-access-token" = {
      env         = "MERCADOPAGO_ACCESS_TOKEN", services = ["web", "api"], required = false
      description = "Mercado Pago (prueba en pruebas, producción en producción). Sin él, el pago con tarjeta sale deshabilitado."
    }
    "mercadopago-webhook-secret" = {
      env         = "MERCADOPAGO_WEBHOOK_SECRET", services = ["web", "api"], required = false
      description = "Clave secreta de los webhooks de Mercado Pago (x-signature). Obligatoria en producción para procesar webhooks."
    }
    "wompi-integrity-secret" = {
      env         = "WOMPI_INTEGRITY_SECRET", services = ["web", "api"], required = false
      description = "Wompi: secreto de integridad del checkout."
    }
    "wompi-events-secret" = {
      env         = "WOMPI_EVENTS_SECRET", services = ["web", "api"], required = false
      description = "Wompi: secreto de eventos (firma del webhook)."
    }
    "supabase-jwt-secret" = {
      env         = "SUPABASE_JWT_SECRET", services = ["api", "realtime"], required = false
      description = "Solo si el proyecto de Supabase sigue firmando con HS256 (con JWKS no hace falta)."
    }
    "database-url" = {
      env         = "DATABASE_URL", services = ["api", "realtime"], required = false
      description = "Fase 4 (DB_ADAPTER=pg): conexión directa de sesión a Cloud SQL por IP privada. El gateway la usa para LISTEN mirai_live (REALTIME_PG_LISTEN=1)."
    }
    "supabase-db-url" = {
      env         = "SUPABASE_DB_URL", services = [], required = false
      description = "Conexión directa a Supabase para migraciones, volcados y DMS. Ningún servicio la monta."
    }
    }, var.stages.redis ? {
    "redis-url" = {
      env         = "REDIS_URL", services = ["api", "realtime"], required = true
      description = "redis[s]://:<AUTH>@<IP>:<puerto> de Memorystore (lo genera la infraestructura). API: publica cambios (REALTIME_API_EMIT); gateway: adaptador y presencia."
    }
  } : {})

  secret_extra_accessors = {
    "supabase-db-url" = { migrator = module.iam.members["migrator"] }
  }

  # Variables de secreto que monta cada servicio.
  mounted_secrets = {
    for svc in ["web", "api", "realtime"] : svc => {
      for k, s in local.secret_catalog : s.env => { secret = module.secrets.secret_ids[k] }
      if contains(s.services, svc) && (s.required || contains(var.optional_secrets, k))
    }
  }
}

module "secrets" {
  source     = "../modules/secrets"
  project_id = var.project_id
  prefix     = local.prefix
  labels     = local.labels

  secrets = {
    for k, s in local.secret_catalog : k => {
      description = s.description
      accessors   = merge({ for svc in s.services : svc => module.iam.members[svc] }, lookup(local.secret_extra_accessors, k, {}))
    }
  }

  generated_values = var.stages.redis ? { "redis-url" = module.redis[0].url } : {}
}
