# GitHub Actions entra a Azure sin secretos: una aplicación de Entra ID + entidad de servicio por clave de `roles`, con
# credenciales federadas (OIDC) que solo aceptan el token de GitHub de este repositorio y de la rama, entorno o PR
# indicados. Los roles de Azure de cada una (Reader, Contributor, AcrPush…) los asigna el bootstrap.
# Azure exige el `subject` exacto (no hay comodines): sin refs ni environments se aceptan refs/heads/main,
# refs/heads/pruebas y los pull requests. repository_id se ignora (el sub de GitHub no lo incluye por defecto).
# context.cloud: tenant_id.

locals {
  repo = "${var.github.owner}/${var.github.repository}"

  subjects = merge([
    for k, r in var.roles : merge(
      { for ref in(length(r.refs) + length(r.environments) == 0 ? ["refs/heads/main", "refs/heads/pruebas"] : r.refs) : "${k}/ref/${ref}" => { role = k, subject = "repo:${local.repo}:ref:${ref}" } },
      { for e in r.environments : "${k}/env/${e}" => { role = k, subject = "repo:${local.repo}:environment:${e}" } },
      r.pull_requests || length(r.refs) + length(r.environments) == 0 ? { "${k}/pr" = { role = k, subject = "repo:${local.repo}:pull_request" } } : {},
    )
  ]...)
}

resource "azuread_application" "this" {
  for_each     = var.roles
  display_name = each.key
  description  = each.value.display_name
  notes        = "GitHub Actions de ${local.repo} (OIDC, sin secretos). Gestionado por Terraform."
}

resource "azuread_service_principal" "this" {
  for_each  = var.roles
  client_id = azuread_application.this[each.key].client_id
}

resource "azuread_application_federated_identity_credential" "this" {
  for_each       = local.subjects
  application_id = azuread_application.this[each.value.role].id
  display_name   = substr(replace(each.key, "/[^A-Za-z0-9-]/", "-"), 0, 120)
  description    = each.value.subject
  audiences      = ["api://AzureADTokenExchange"]
  issuer         = "https://token.actions.githubusercontent.com"
  subject        = each.value.subject
}
