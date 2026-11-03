# redis/aws: ElastiCache for Redis (grupo de replicación) en las subredes privadas, con TLS y AUTH siempre (AUTH exige
# TLS en ElastiCache; la CA es pública de Amazon, así que el cliente no necesita una CA propia). var.tls se ignora.
# high_availability = 2 nodos en zonas distintas con conmutación automática.
#
# cloud_options: node_type (string; si no, según memory_gb: ≤1 cache.t4g.small, ≤3 cache.t4g.medium,
# ≤6 cache.m7g.large, más cache.m7g.xlarge), engine_version (string, "7.1").

locals {
  opts = var.cloud_options
  node = try(local.opts.node_type, null) != null ? local.opts.node_type : (
    var.memory_gb <= 1 ? "cache.t4g.small" : var.memory_gb <= 3 ? "cache.t4g.medium" : var.memory_gb <= 6 ? "cache.m7g.large" : "cache.m7g.xlarge"
  )
  id = substr(var.name, 0, 40)
}

resource "random_password" "auth" {
  length  = 48
  special = false
}

resource "aws_elasticache_subnet_group" "this" {
  name       = var.name
  subnet_ids = var.network.private_subnet_ids
  tags       = var.context.labels
}

resource "aws_security_group" "this" {
  name        = "${var.name}-sg"
  description = "Redis de ${var.context.prefix}: 6379 solo desde la VPC."
  vpc_id      = var.network.vpc_id
  tags        = merge(var.context.labels, { Name = "${var.name}-sg" })
}

resource "aws_vpc_security_group_ingress_rule" "redis" {
  security_group_id = aws_security_group.this.id
  description       = "Redis desde la VPC."
  cidr_ipv4         = var.network.cidr
  ip_protocol       = "tcp"
  from_port         = 6379
  to_port           = 6379
}

resource "aws_elasticache_replication_group" "this" {
  replication_group_id       = local.id
  description                = "Mirai ${var.name}: adaptador de socket.io y presencia."
  engine                     = "redis"
  engine_version             = try(local.opts.engine_version, "7.1")
  node_type                  = local.node
  port                       = 6379
  num_cache_clusters         = var.high_availability ? 2 : 1
  automatic_failover_enabled = var.high_availability
  multi_az_enabled           = var.high_availability
  subnet_group_name          = aws_elasticache_subnet_group.this.name
  security_group_ids         = [aws_security_group.this.id]
  transit_encryption_enabled = true
  at_rest_encryption_enabled = true
  auth_token                 = random_password.auth.result
  maintenance_window         = "sun:09:00-sun:10:00"
  snapshot_retention_limit   = var.high_availability ? 1 : 0
  apply_immediately          = var.context.environment != "produccion"
  tags                       = var.context.labels
}
