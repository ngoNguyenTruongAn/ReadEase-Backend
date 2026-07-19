variable "aws_region" {
  description = "AWS region used by ReadEase."
  type        = string
  default     = "ap-southeast-1"
}

variable "project_name" {
  description = "Project prefix used for resource names and tags."
  type        = string
  default     = "readease"
}

variable "environment" {
  description = "Deployment environment name."
  type        = string
  default     = "demo"
}

variable "vpc_cidr" {
  description = "CIDR block for the VPC."
  type        = string
  default     = "10.0.0.0/16"
}

variable "public_subnet_a_cidr" {
  type    = string
  default = "10.0.1.0/24"
}

variable "public_subnet_b_cidr" {
  type    = string
  default = "10.0.2.0/24"
}

variable "private_app_subnet_a_cidr" {
  type    = string
  default = "10.0.11.0/24"
}

variable "private_db_subnet_a_cidr" {
  type    = string
  default = "10.0.21.0/24"
}

variable "private_db_subnet_b_cidr" {
  type    = string
  default = "10.0.22.0/24"
}

variable "frontend_image_tag" {
  description = "Container tag deployed by the frontend ECS service."
  type        = string
  default     = "latest"
}

variable "backend_image_tag" {
  description = "Container tag deployed by the NestJS backend container."
  type        = string
  default     = "latest"
}

variable "ml_image_tag" {
  description = "Container tag deployed by the FastAPI ML container."
  type        = string
  default     = "latest"
}

variable "deploy_services" {
  description = "Create ECS services after all three application images have been pushed to ECR."
  type        = bool
  default     = false
}

variable "frontend_cpu" {
  type    = number
  default = 256
}

variable "frontend_memory" {
  type    = number
  default = 512
}

variable "backend_cpu" {
  type    = number
  default = 1024
}

variable "backend_memory" {
  type    = number
  default = 2048
}

variable "db_instance_class" {
  description = "RDS instance class for the Single-AZ demo database."
  type        = string
  default     = "db.t4g.micro"
}

variable "db_allocated_storage" {
  type    = number
  default = 20
}

variable "db_name" {
  type    = string
  default = "readease"
}

variable "db_username" {
  type    = string
  default = "readease_app"
}

variable "log_retention_days" {
  type    = number
  default = 7
}

variable "application_secrets" {
  description = "External application credentials stored in Secrets Manager. Values are persisted in Terraform state."
  type        = map(string)
  sensitive   = true
  default     = {}
}

variable "force_delete_ecr" {
  description = "Allow ECR repositories to be destroyed even when they contain images."
  type        = bool
  default     = false
}

variable "skip_final_db_snapshot" {
  description = "Skip the final RDS snapshot when destroying this demo environment."
  type        = bool
  default     = true
}
