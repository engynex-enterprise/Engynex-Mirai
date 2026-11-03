terraform {
  required_version = ">= 1.9.0"
  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = ">= 6.0, < 7.0"
      # CloudFront exige el certificado, el WAF y las métricas de Route 53 en us-east-1.
      configuration_aliases = [aws.us_east_1]
    }
  }
}
