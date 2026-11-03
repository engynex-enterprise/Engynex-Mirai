# network/aws: VPC con subredes públicas (NAT, nada más) y privadas (tareas de ECS, ALB interno, RDS, ElastiCache).
# El CIDR se parte en 8 bloques iguales (cidrsubnet(cidr, 3, i)): públicas en 0..zones-1 y privadas en 4..4+zones-1.
# Con un /16 cada subred es /19; con un /20, /23. AWS exige al menos /28 por subred, así que el cidr debe ser /25 o mayor.
#
# cloud_options:
#   nat_per_zone (bool, false) = un NAT Gateway por zona (producción, sin punto único de falla). false = uno solo.
# nat_static_ip_count: en AWS la salida por NAT ya usa IP elásticas fijas (una por NAT Gateway), así que se ignora el
# número y nat_ips devuelve las IP de los NAT.
# private_services: en AWS no crea nada aparte (RDS y ElastiCache usan las subredes privadas con grupos de subredes).

data "aws_availability_zones" "this" {
  state = "available"
}

locals {
  opts         = var.cloud_options
  nat_per_zone = try(local.opts.nat_per_zone, false)
  azs          = slice(data.aws_availability_zones.this.names, 0, var.zones)
  nat_count    = var.nat ? (local.nat_per_zone ? var.zones : 1) : 0
  tags         = merge(var.context.labels, { Name = "${var.context.prefix}-vpc" })
}

resource "aws_vpc" "this" {
  cidr_block           = var.cidr
  enable_dns_support   = true
  enable_dns_hostnames = true
  tags                 = local.tags
}

resource "aws_internet_gateway" "this" {
  vpc_id = aws_vpc.this.id
  tags   = merge(var.context.labels, { Name = "${var.context.prefix}-igw" })
}

resource "aws_subnet" "public" {
  count                   = var.zones
  vpc_id                  = aws_vpc.this.id
  cidr_block              = cidrsubnet(var.cidr, 3, count.index)
  availability_zone       = local.azs[count.index]
  map_public_ip_on_launch = false
  tags                    = merge(var.context.labels, { Name = "${var.context.prefix}-publica-${count.index}", tier = "publica" })
}

resource "aws_subnet" "private" {
  count             = var.zones
  vpc_id            = aws_vpc.this.id
  cidr_block        = cidrsubnet(var.cidr, 3, count.index + 4)
  availability_zone = local.azs[count.index]
  tags              = merge(var.context.labels, { Name = "${var.context.prefix}-privada-${count.index}", tier = "privada" })
}

resource "aws_route_table" "public" {
  vpc_id = aws_vpc.this.id
  tags   = merge(var.context.labels, { Name = "${var.context.prefix}-publica" })
}

resource "aws_route" "public_internet" {
  route_table_id         = aws_route_table.public.id
  destination_cidr_block = "0.0.0.0/0"
  gateway_id             = aws_internet_gateway.this.id
}

resource "aws_route_table_association" "public" {
  count          = var.zones
  subnet_id      = aws_subnet.public[count.index].id
  route_table_id = aws_route_table.public.id
}

resource "aws_eip" "nat" {
  count  = local.nat_count
  domain = "vpc"
  tags   = merge(var.context.labels, { Name = "${var.context.prefix}-nat-${count.index}" })
}

resource "aws_nat_gateway" "this" {
  count         = local.nat_count
  allocation_id = aws_eip.nat[count.index].id
  subnet_id     = aws_subnet.public[count.index].id
  tags          = merge(var.context.labels, { Name = "${var.context.prefix}-nat-${count.index}" })

  depends_on = [aws_internet_gateway.this]
}

# Una tabla por subred privada: con un NAT por zona cada una sale por el suyo; con uno solo, todas por el 0.
resource "aws_route_table" "private" {
  count  = var.zones
  vpc_id = aws_vpc.this.id
  tags   = merge(var.context.labels, { Name = "${var.context.prefix}-privada-${count.index}" })
}

resource "aws_route" "private_nat" {
  count                  = local.nat_count > 0 ? var.zones : 0
  route_table_id         = aws_route_table.private[count.index].id
  destination_cidr_block = "0.0.0.0/0"
  nat_gateway_id         = aws_nat_gateway.this[local.nat_per_zone ? count.index : 0].id
}

resource "aws_route_table_association" "private" {
  count          = var.zones
  subnet_id      = aws_subnet.private[count.index].id
  route_table_id = aws_route_table.private[count.index].id
}

# Endpoint de puerta de enlace de S3 (gratis): el tráfico a los buckets no pasa por el NAT.
resource "aws_vpc_endpoint" "s3" {
  vpc_id            = aws_vpc.this.id
  service_name      = "com.amazonaws.${var.context.region}.s3"
  vpc_endpoint_type = "Gateway"
  route_table_ids   = aws_route_table.private[*].id
  tags              = merge(var.context.labels, { Name = "${var.context.prefix}-s3" })
}

# ── Registros de flujo (opcionales) ─────────────────────────────────────────────────────────────────────────────
resource "aws_cloudwatch_log_group" "flow" {
  count             = var.flow_logs ? 1 : 0
  name              = "/vpc/${var.context.prefix}/flujos"
  retention_in_days = 14
  tags              = var.context.labels
}

resource "aws_iam_role" "flow" {
  count = var.flow_logs ? 1 : 0
  name  = "${var.context.prefix}-flujos-vpc"
  assume_role_policy = jsonencode({
    Version   = "2012-10-17"
    Statement = [{ Effect = "Allow", Principal = { Service = "vpc-flow-logs.amazonaws.com" }, Action = "sts:AssumeRole" }]
  })
  tags = var.context.labels
}

resource "aws_iam_role_policy" "flow" {
  count = var.flow_logs ? 1 : 0
  name  = "escribir-registros"
  role  = aws_iam_role.flow[0].id
  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [{
      Effect   = "Allow"
      Action   = ["logs:CreateLogStream", "logs:PutLogEvents", "logs:DescribeLogGroups", "logs:DescribeLogStreams"]
      Resource = "${aws_cloudwatch_log_group.flow[0].arn}:*"
    }]
  })
}

resource "aws_flow_log" "this" {
  count           = var.flow_logs ? 1 : 0
  vpc_id          = aws_vpc.this.id
  traffic_type    = "ALL"
  log_destination = aws_cloudwatch_log_group.flow[0].arn
  iam_role_arn    = aws_iam_role.flow[0].arn
  tags            = var.context.labels
}
