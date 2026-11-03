output "platform" {
  description = "Handle de la plataforma (AWS): clúster, Service Connect, ALB interno, grupos de seguridad, subredes y registros."
  value = {
    cluster_arn        = aws_ecs_cluster.this.arn
    cluster_name       = aws_ecs_cluster.this.name
    namespace_arn      = aws_service_discovery_http_namespace.this.arn
    namespace_name     = aws_service_discovery_http_namespace.this.name
    alb_arn            = aws_lb.this.arn
    alb_arn_suffix     = aws_lb.this.arn_suffix
    alb_dns_name       = aws_lb.this.dns_name
    alb_sg_id          = aws_security_group.alb.id
    listener_arn       = aws_lb_listener.http.arn
    tasks_sg_id        = aws_security_group.tasks.id
    private_subnet_ids = var.network.private_subnet_ids
    vpc_id             = var.network.vpc_id
    vpc_cidr           = var.network.cidr
    region             = var.context.region
    log_group_name     = aws_cloudwatch_log_group.this.name
  }
}

output "id" {
  description = "ARN del clúster ECS."
  value       = aws_ecs_cluster.this.arn
}

output "internal_domain" {
  description = "Espacio de nombres de Service Connect (<servicio>.<este dominio>)."
  value       = aws_service_discovery_http_namespace.this.name
}
