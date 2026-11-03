output "handles" {
  description = "Clave → { id, principal_id, client_id, name } de la identidad administrada."
  value = {
    for k, i in azurerm_user_assigned_identity.this : k => {
      id           = i.id
      principal_id = i.principal_id
      client_id    = i.client_id
      name         = i.name
    }
  }
}

output "principals" {
  description = "Clave → principal_id (para asignaciones de rol)."
  value       = { for k, i in azurerm_user_assigned_identity.this : k => i.principal_id }
}

output "ids" {
  description = "Clave → ID de recurso de la identidad."
  value       = { for k, i in azurerm_user_assigned_identity.this : k => i.id }
}
