resource "aws_cloudwatch_log_group" "frontend" {
  name              = "/ecs/${local.name}/frontend"
  retention_in_days = var.log_retention_days
}

resource "aws_cloudwatch_log_group" "backend" {
  name              = "/ecs/${local.name}/backend"
  retention_in_days = var.log_retention_days
}

resource "aws_cloudwatch_log_group" "ml" {
  name              = "/ecs/${local.name}/ml"
  retention_in_days = var.log_retention_days
}

resource "aws_cloudwatch_log_group" "redis" {
  name              = "/ecs/${local.name}/redis"
  retention_in_days = var.log_retention_days
}

