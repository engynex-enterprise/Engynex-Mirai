output "web_origin" {
  description = "https://<dominio de la web>."
  value       = local.web_origin
}

output "api_origin" {
  description = "https://<dominio público de la API> (webhooks, callback de Google)."
  value       = local.api_origin
}

output "files_origin" {
  description = "https://<dominio de archivos públicos> (PUBLIC_FILES_URL)."
  value       = local.files_origin
}

output "web_origins" {
  description = "WEB_ORIGINS: CORS de la API y de los buckets, origen del WebSocket."
  value       = local.web_origins
}

output "hosts" {
  description = "Dominio → origen del borde (sin canarios)."
  value       = local.hosts
}

output "canary_hosts" {
  description = "Dominios de los canarios → origen (las nubes con revisiones etiquetadas los suman)."
  value       = local.canary_hosts
}

output "routes" {
  description = "Rutas por camino del mismo origen (capacidad edge.routes)."
  value       = local.routes
}

output "env" {
  description = "Variables (sin secretos) por servicio: web, api, realtime, worker, postgrest y migrate."
  value = {
    web       = local.web_env
    api       = local.api_env
    realtime  = local.realtime_env
    worker    = local.worker_env
    postgrest = local.postgrest_env
    migrate   = local.migrate_env
  }
}

output "web_build_env" {
  description = "NEXT_PUBLIC_* (y MIRAI_CSP_ENFORCE) que se incrustan al compilar la web."
  value       = local.web_build_env
}

output "web_build_env_text" {
  description = "Las mismas, como archivo .env (una por línea, ordenadas): GitHub Actions la guarda en la variable WEB_BUILD_ENV."
  value       = local.web_build_env_text
}

output "web_build_env_b64" {
  description = "web_build_env_text en base64 (argumento WEB_BUILD_ENV_B64 de infra/docker/web.Dockerfile)."
  value       = base64encode(local.web_build_env_text)
}

output "secret_catalog" {
  description = "Clave → { env, env_as, services, readers, required, generated, description }."
  value       = local.secret_catalog
}

output "mounted_secrets" {
  description = "Servicio → { VARIABLE → clave del secreto } (solo los obligatorios y los opcionales con valor)."
  value       = local.mounted_secrets
}

output "secret_readers" {
  description = "Clave del secreto → servicios que lo pueden leer."
  value       = local.secret_readers
}

output "generated_secret_keys" {
  description = "Secretos que genera la infraestructura."
  value       = local.generated_secret_keys
}
