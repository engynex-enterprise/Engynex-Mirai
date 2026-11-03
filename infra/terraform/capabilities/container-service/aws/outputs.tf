output "service_id" {
  description = "ARN del servicio de ECS."
  value       = aws_ecs_service.this.id
}

output "name" {
  description = "Nombre del servicio."
  value       = aws_ecs_service.this.name
}

output "internal_url" {
  description = "URL interna por Service Connect (solo la resuelven tareas con Service Connect)."
  value       = "http://${local.dns_name}:${var.port}"
}

output "public_url" {
  description = "En AWS el servicio no tiene URL pública propia (todo entra por CloudFront → ALB interno)."
  value       = null
}

output "edge_origin" {
  description = "Handle para el borde (AWS): ALB interno, listener y grupo de destino."
  value = {
    kind                    = "alb"
    alb_arn                 = local.p.alb_arn
    alb_arn_suffix          = local.p.alb_arn_suffix
    alb_dns_name            = local.p.alb_dns_name
    listener_arn            = local.p.listener_arn
    target_group_arn        = local.has_lb ? aws_lb_target_group.this[0].arn : null
    target_group_arn_suffix = local.has_lb ? aws_lb_target_group.this[0].arn_suffix : null
    service_name            = var.name
    cluster_name            = local.p.cluster_name
    ssm_image_parameter     = aws_ssm_parameter.image.name
  }
}
