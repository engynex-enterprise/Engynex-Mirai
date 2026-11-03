# postgres/aws: RDS for PostgreSQL en las subredes privadas, cifrado, TLS obligatorio (rds.force_ssl), copias diarias
# (backup_days; en RDS la recuperación a un punto en el tiempo cubre la misma ventana, así que pitr_days se ignora),
# Performance Insights y Multi-AZ con high_availability.
#
# Usuarios: el administrador (mirai_admin) y cada app_users tienen contraseña generada (random_password, sin símbolos
# para que la URL no necesite escapes). Terraform NO crea los roles de app_users dentro de Postgres: no tiene acceso a
# la red privada. Los crea la línea base SQL (V7-C, db/postgres/0000_compat.sql) desde el trabajo db-migrate, que corre
# con admin_url y lee las contraseñas de los secretos database-url / postgrest-db-uri. iam_identities e iam_users se
# ignoran (en AWS la app entra con contraseña; el soporte, con el administrador por el trabajo de migraciones).
#
# Tamaños (size → clase): xs db.t4g.micro (solo pruebas) · s db.t4g.medium (2 vCPU ráfaga, 4 GB) ·
# m db.m7g.large (2 vCPU, 8 GB) · l db.m7g.xlarge (4 vCPU, 16 GB).
#
# cloud_options: tier (string, pisa size), admin_username (string, "mirai_admin"), performance_insights (bool, true
# salvo xs), backup_window ("08:00-08:30" UTC = 3 a. m. Colombia), maintenance_window ("sun:09:00-sun:10:00").

locals {
  opts    = var.cloud_options
  classes = { xs = "db.t4g.micro", s = "db.t4g.medium", m = "db.m7g.large", l = "db.m7g.xlarge" }
  class   = try(local.opts.tier, null) != null ? local.opts.tier : local.classes[var.size]
  admin   = try(local.opts.admin_username, "mirai_admin")
  pi      = try(local.opts.performance_insights, var.size != "xs")
  is_prod = var.context.environment == "produccion"
}

resource "random_password" "admin" {
  length  = 40
  special = false
}

resource "random_password" "users" {
  for_each = var.app_users
  length   = 40
  special  = false
}

resource "aws_db_subnet_group" "this" {
  name       = var.name
  subnet_ids = var.network.private_subnet_ids
  tags       = var.context.labels
}

resource "aws_security_group" "this" {
  name        = "${var.name}-sg"
  description = "Postgres de ${var.context.prefix}: 5432 solo desde la VPC."
  vpc_id      = var.network.vpc_id
  tags        = merge(var.context.labels, { Name = "${var.name}-sg" })
}

resource "aws_vpc_security_group_ingress_rule" "pg" {
  security_group_id = aws_security_group.this.id
  description       = "Postgres desde la VPC."
  cidr_ipv4         = var.network.cidr
  ip_protocol       = "tcp"
  from_port         = 5432
  to_port           = 5432
}

resource "aws_db_parameter_group" "this" {
  name        = "${var.name}-pg${var.engine_version}"
  family      = "postgres${var.engine_version}"
  description = "Parámetros de ${var.name}."
  tags        = var.context.labels

  parameter {
    name  = "rds.force_ssl"
    value = "1"
  }

  parameter {
    name  = "log_min_duration_statement"
    value = "1000" # consultas de más de 1 s quedan en el registro (sin parámetros)
  }

  parameter {
    name  = "log_lock_waits"
    value = "1"
  }

  dynamic "parameter" {
    for_each = var.max_connections == null ? [] : [var.max_connections]
    content {
      name         = "max_connections"
      value        = tostring(parameter.value)
      apply_method = "pending-reboot"
    }
  }

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_db_instance" "this" {
  identifier                          = var.name
  engine                              = "postgres"
  engine_version                      = tostring(var.engine_version)
  auto_minor_version_upgrade          = true
  instance_class                      = local.class
  allocated_storage                   = var.storage_gb
  max_allocated_storage               = var.storage_max_gb
  storage_type                        = "gp3"
  storage_encrypted                   = true
  multi_az                            = var.high_availability
  db_name                             = var.database_name
  username                            = local.admin
  password                            = random_password.admin.result
  manage_master_user_password         = false
  port                                = 5432
  db_subnet_group_name                = aws_db_subnet_group.this.name
  vpc_security_group_ids              = [aws_security_group.this.id]
  parameter_group_name                = aws_db_parameter_group.this.name
  publicly_accessible                 = false
  iam_database_authentication_enabled = true
  ca_cert_identifier                  = "rds-ca-rsa2048-g1"
  backup_retention_period             = var.backup_days
  backup_window                       = try(local.opts.backup_window, "08:00-08:30")
  maintenance_window                  = try(local.opts.maintenance_window, "sun:09:00-sun:10:00")
  copy_tags_to_snapshot               = true
  delete_automated_backups            = false
  deletion_protection                 = var.deletion_protection
  skip_final_snapshot                 = !var.deletion_protection
  final_snapshot_identifier           = var.deletion_protection ? "${var.name}-final" : null
  performance_insights_enabled        = local.pi
  enabled_cloudwatch_logs_exports     = ["postgresql"]
  apply_immediately                   = !local.is_prod
  tags                                = var.context.labels
}

locals {
  host = aws_db_instance.this.address
  port = aws_db_instance.this.port
  urls = {
    for k, u in var.app_users : k => "postgres://${u}:${random_password.users[k].result}@${local.host}:${local.port}/${var.database_name}?sslmode=require"
  }
}
