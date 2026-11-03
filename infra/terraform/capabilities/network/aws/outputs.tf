output "network" {
  description = "Handle de la red (AWS): vpc_id, cidr, zonas y subredes. Lo consumen container-platform, postgres y redis de AWS."
  value = {
    vpc_id                  = aws_vpc.this.id
    cidr                    = aws_vpc.this.cidr_block
    azs                     = local.azs
    public_subnet_ids       = aws_subnet.public[*].id
    private_subnet_ids      = aws_subnet.private[*].id
    private_route_table_ids = aws_route_table.private[*].id
    region                  = var.context.region
  }
}

output "id" {
  description = "ID de la VPC."
  value       = aws_vpc.this.id
}

output "nat_ips" {
  description = "IP elásticas de salida (una por NAT Gateway). Son las que se dan a una integración con lista blanca."
  value       = aws_eip.nat[*].public_ip
}
