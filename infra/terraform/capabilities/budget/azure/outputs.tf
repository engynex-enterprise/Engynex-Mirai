output "id" {
  description = "ID del presupuesto."
  value       = local.is_sub ? azurerm_consumption_budget_subscription.this[0].id : azurerm_consumption_budget_resource_group.this[0].id
}
