output "application_url" {
  description = "ReadEase URL exposed by the Application Load Balancer."
  value       = "http://${aws_lb.main.dns_name}"
}

output "frontend_ecr_repository_url" {
  value = aws_ecr_repository.frontend.repository_url
}

output "backend_ecr_repository_url" {
  value = aws_ecr_repository.backend.repository_url
}

output "ml_ecr_repository_url" {
  value = aws_ecr_repository.ml.repository_url
}

output "ecs_cluster_name" {
  value = aws_ecs_cluster.main.name
}

output "frontend_service_name" {
  value = try(aws_ecs_service.frontend[0].name, null)
}

output "backend_service_name" {
  value = try(aws_ecs_service.backend[0].name, null)
}

output "frontend_task_definition_arn" {
  value = aws_ecs_task_definition.frontend.arn
}

output "backend_task_definition_arn" {
  value = aws_ecs_task_definition.backend.arn
}

output "private_app_subnet_id" {
  value = aws_subnet.private_app_a.id
}

output "backend_security_group_id" {
  value = aws_security_group.backend.id
}

output "rds_endpoint" {
  value = aws_db_instance.main.address
}

output "rds_master_secret_arn" {
  value     = aws_db_instance.main.master_user_secret[0].secret_arn
  sensitive = true
}

output "media_bucket_name" {
  value = aws_s3_bucket.media.bucket
}
