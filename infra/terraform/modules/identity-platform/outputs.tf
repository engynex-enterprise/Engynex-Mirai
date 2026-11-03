output "auth_domain" {
  description = "Dominio de autenticación por defecto (<proyecto>.firebaseapp.com); se puede cambiar por uno propio."
  value       = "${var.project_id}.firebaseapp.com"
}

output "issuer" {
  description = "Emisor de los ID tokens que validará la API (TokenVerifier de Identity Platform)."
  value       = "https://securetoken.google.com/${var.project_id}"
}

output "jwks_uri" {
  description = "JWKS para validar los tokens."
  value       = "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com"
}
