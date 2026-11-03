# Catálogo de secretos, igual en las tres nubes. Nombres de variable = los que leen apps/api (config.schema.ts,
# integrations/services-env.ts, billing/billing.config.ts, realtime/realtime.config.ts) y apps/web (.env.example).
#   services  = quién lo monta como variable (web, api, realtime, worker, postgrest, migrate, scheduler); el worker monta
#               todo lo de la API.
#   env_as    = nombre distinto en un servicio (PostgREST lee PGRST_*).
#   required  = se monta siempre (la app no arranca sin él); los opcionales solo si están en optional_secrets.
#   generated = lo genera la infraestructura (URL de la base y de Redis, secretos internos): nadie lo carga a mano.
#   readers   = servicios que pueden leerlo sin montarlo (migraciones desde Supabase).
# Las claves de las integraciones globales (Resend, Brevo, SendGrid, SMTP, WhatsApp/Meta, Telegram, proveedores de IA,
# AdSense…) NO son variables: viven cifradas en platform_integrations con ENCRYPTION_KEY (consola › Integraciones).

locals {
  pg  = local.f.postgres
  rst = local.f.postgrest

  secret_catalog_all = {
    "encryption-key" = {
      env         = "ENCRYPTION_KEY", services = ["web", "api", "realtime"], required = true, generated = false
      description = "AES-256-GCM de las integraciones (32 bytes base64). Copiar EXACTA la de Vercel: no se puede cambiar."
    }
    "cron-secret" = {
      env         = "CRON_SECRET", services = ["web", "api", "scheduler"], required = true, generated = false
      description = "Bearer de /v1/jobs/* (SchedulerGuard): el cron de AWS y Azure lo manda; en GCP es el respaldo del OIDC."
    }
    "better-auth-secret" = {
      env         = "BETTER_AUTH_SECRET", services = ["api", "realtime"], required = var.auth_provider == "mirai", generated = true
      description = "Firma de las cookies y tokens de Better Auth (D1). Lo genera Terraform; rotarlo cierra todas las sesiones."
    }
    "turnstile-secret" = {
      env         = "TURNSTILE_SECRET_KEY", services = ["api"], required = false, generated = false
      description = "Cloudflare Turnstile: la API verifica el desafío del registro y el login (antes lo hacía Supabase)."
    }
    "database-url" = {
      env         = "DATABASE_URL", services = ["api", "realtime"], required = local.pg, generated = true
      description = "Conexión directa de sesión (TLS) a la Postgres de la nube con el usuario de la app. El gateway la usa para LISTEN mirai_live."
    }
    "database-admin-url" = {
      env         = "DATABASE_URL", services = ["migrate"], required = local.pg, generated = true
      description = "Conexión con el usuario de migraciones (dueño del esquema). Solo el trabajo db-migrate."
    }
    "postgrest-db-uri" = {
      env         = "PGRST_DB_URI", services = ["postgrest"], required = local.pg && local.rst, generated = true
      description = "Conexión de PostgREST con el rol authenticator (D4)."
    }
    "postgrest-jwt-secret" = {
      env         = "POSTGREST_JWT_SECRET", env_as = { postgrest = "PGRST_JWT_SECRET" }, services = ["api", "postgrest"], required = local.rst, generated = true
      description = "HS256 del JWT interno de 60 s entre la API y PostgREST. Solo lo conocen esos dos."
    }
    "redis-url" = {
      env         = "REDIS_URL", services = ["api", "realtime"], required = local.f.redis, generated = true
      description = "redis[s]://:<AUTH>@<host>:<puerto> (lo genera la infraestructura). API: publica cambios; gateway: adaptador y presencia."
    }
    "supabase-secret-key" = {
      env         = "SUPABASE_SECRET_KEY", services = ["web", "api", "realtime"], required = local.f.supabase, generated = false
      description = "Clave secreta de Supabase (puente del paso A). Se borra al apagar Supabase (§5.5)."
    }
    "supabase-jwt-secret" = {
      env         = "SUPABASE_JWT_SECRET", services = ["api", "realtime"], required = false, generated = false
      description = "Solo si el proyecto de Supabase sigue firmando con HS256 (con JWKS no hace falta)."
    }
    "supabase-db-url" = {
      env         = "SUPABASE_DB_URL", services = [], readers = ["migrate"], required = false, generated = false
      description = "Conexión directa a Supabase para volcados y ensayos del corte. Ningún servicio la monta."
    }
    "google-client-secret" = {
      env         = "GOOGLE_CLIENT_SECRET", services = ["web", "api"], required = false, generated = false
      description = "OAuth de Google (login con Better Auth, Gmail solo lectura y Calendar)."
    }
    "google-oauth-state-key" = {
      env         = "GOOGLE_OAUTH_STATE_KEY", services = ["api"], required = false, generated = false
      description = "HMAC del state de OAuth de Google en la API (32+ caracteres; openssl rand -base64 32)."
    }
    "ai-gateway-api-key" = {
      env         = "AI_GATEWAY_API_KEY", services = ["web", "api"], required = false, generated = false
      description = "Vercel AI Gateway (solo si el dueño lo mantiene; D13 propone Vertex AI)."
    }
    "vapid-private-key" = {
      env         = "VAPID_PRIVATE_KEY", services = ["web", "api"], required = false, generated = false
      description = "Web Push: llave privada VAPID (pareja de NEXT_PUBLIC_VAPID_PUBLIC_KEY). No cambiarla."
    }
    "upstash-redis-rest-token" = {
      env         = "UPSTASH_REDIS_REST_TOKEN", services = ["web"], required = false, generated = false
      description = "Upstash Redis REST (límite de IA en la web; desaparece cuando la web no tenga backend)."
    }
    "mercadopago-access-token" = {
      env         = "MERCADOPAGO_ACCESS_TOKEN", services = ["web", "api"], required = false, generated = false
      description = "Mercado Pago (prueba en pruebas, producción en producción)."
    }
    "mercadopago-webhook-secret" = {
      env         = "MERCADOPAGO_WEBHOOK_SECRET", services = ["web", "api"], required = false, generated = false
      description = "Firma x-signature de los webhooks de Mercado Pago (obligatoria en producción)."
    }
    "wompi-integrity-secret" = {
      env         = "WOMPI_INTEGRITY_SECRET", services = ["web", "api"], required = false, generated = false
      description = "Wompi: secreto de integridad del checkout."
    }
    "wompi-events-secret" = {
      env         = "WOMPI_EVENTS_SECRET", services = ["web", "api"], required = false, generated = false
      description = "Wompi: secreto de eventos (firma del webhook)."
    }
  }

  # Solo existen los secretos que el ambiente puede usar (los de la base, PostgREST y Redis, si esas piezas existen).
  secret_catalog = {
    for k, s in local.secret_catalog_all : k => {
      env         = s.env
      env_as      = { for svc, n in try(s.env_as, {}) : svc => n }
      services    = tolist(s.services)
      readers     = tolist(try(s.readers, []))
      required    = s.required
      generated   = s.generated
      description = s.description
    }
    if !contains(keys(local.conditional_secrets), k) || local.conditional_secrets[k]
  }

  conditional_secrets = {
    "database-url"         = local.pg
    "database-admin-url"   = local.pg
    "postgrest-db-uri"     = local.pg && local.rst
    "postgrest-jwt-secret" = local.rst
    "redis-url"            = local.f.redis
    "better-auth-secret"   = var.auth_provider == "mirai"
  }

  service_names = ["web", "api", "realtime", "worker", "postgrest", "migrate", "scheduler"]

  # Servicio → { VARIABLE → clave del secreto }. El worker monta lo mismo que la API.
  mounted_secrets = {
    for svc in local.service_names : svc => {
      for k, s in local.secret_catalog : lookup(s.env_as, svc, s.env) => k
      if contains(s.services, svc == "worker" ? "api" : svc) && (s.required || contains(var.optional_secrets, k))
    }
  }

  # Servicio → claves que puede leer (montadas + readers). Cada nube lo traduce a permisos sobre cada secreto.
  secret_readers = {
    for k, s in local.secret_catalog : k => distinct(concat(
      [for svc in local.service_names : svc if contains(s.services, svc == "worker" ? "api" : svc)],
      s.readers,
    ))
  }

  generated_secret_keys = [for k, s in local.secret_catalog : k if s.generated]

  unknown_optional = [for s in var.optional_secrets : s if !contains(keys(local.secret_catalog_all), s)]
}

check "optional_secrets_conocidos" {
  assert {
    condition     = length(local.unknown_optional) == 0
    error_message = "optional_secrets tiene claves que no están en el catálogo (capabilities/app-config/secrets.tf): ${join(", ", local.unknown_optional)}."
  }
}
