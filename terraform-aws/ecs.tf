resource "aws_ecs_cluster" "main" {
  name = "${local.name}-cluster"

  setting {
    name  = "containerInsights"
    value = "disabled"
  }
}

resource "aws_ecs_task_definition" "frontend" {
  family                   = "${local.name}-frontend"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = var.frontend_cpu
  memory                   = var.frontend_memory
  execution_role_arn       = aws_iam_role.ecs_execution.arn

  container_definitions = jsonencode([
    {
      name      = "frontend"
      image     = "${aws_ecr_repository.frontend.repository_url}:${var.frontend_image_tag}"
      essential = true
      portMappings = [{
        name          = "frontend-http"
        containerPort = 80
        hostPort      = 80
        protocol      = "tcp"
        appProtocol   = "http"
      }]
      healthCheck = {
        command     = ["CMD-SHELL", "wget -q -O - http://127.0.0.1/ >/dev/null || exit 1"]
        interval    = 30
        timeout     = 5
        retries     = 3
        startPeriod = 10
      }
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = aws_cloudwatch_log_group.frontend.name
          "awslogs-region"        = var.aws_region
          "awslogs-stream-prefix" = "ecs"
        }
      }
    },
  ])
}

resource "aws_ecs_task_definition" "backend" {
  family                   = "${local.name}-backend"
  requires_compatibilities = ["FARGATE"]
  network_mode             = "awsvpc"
  cpu                      = var.backend_cpu
  memory                   = var.backend_memory
  execution_role_arn       = aws_iam_role.ecs_execution.arn
  task_role_arn            = aws_iam_role.backend_task.arn

  container_definitions = jsonencode([
    {
      name      = "redis"
      image     = "redis:7-alpine"
      essential = true
      cpu       = 128
      memory    = 256
      command   = ["redis-server", "--appendonly", "no", "--save", ""]
      healthCheck = {
        command     = ["CMD-SHELL", "redis-cli ping | grep PONG"]
        interval    = 15
        timeout     = 5
        retries     = 3
        startPeriod = 5
      }
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = aws_cloudwatch_log_group.redis.name
          "awslogs-region"        = var.aws_region
          "awslogs-stream-prefix" = "ecs"
        }
      }
    },
    {
      name      = "ml"
      image     = "${aws_ecr_repository.ml.repository_url}:${var.ml_image_tag}"
      essential = true
      cpu       = 512
      memory    = 1024
      healthCheck = {
        command     = ["CMD-SHELL", "python -c \"import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/health')\" || exit 1"]
        interval    = 30
        timeout     = 5
        retries     = 3
        startPeriod = 20
      }
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = aws_cloudwatch_log_group.ml.name
          "awslogs-region"        = var.aws_region
          "awslogs-stream-prefix" = "ecs"
        }
      }
    },
    {
      name      = "backend"
      image     = "${aws_ecr_repository.backend.repository_url}:${var.backend_image_tag}"
      essential = true
      cpu       = 384
      memory    = 640
      dependsOn = [
        { containerName = "redis", condition = "HEALTHY" },
        { containerName = "ml", condition = "HEALTHY" },
      ]
      portMappings = [{
        name          = "backend-http"
        containerPort = 3000
        hostPort      = 3000
        protocol      = "tcp"
        appProtocol   = "http"
      }]
      environment = [
        { name = "NODE_ENV", value = "production" },
        { name = "APP_ENV", value = "production" },
        { name = "APP_PORT", value = "3000" },
        { name = "LOG_LEVEL", value = "info" },
        { name = "DB_HOST", value = aws_db_instance.main.address },
        { name = "DB_PORT", value = "5432" },
        { name = "DB_NAME", value = var.db_name },
        { name = "DB_USER", value = var.db_username },
        { name = "DB_SSL", value = "true" },
        { name = "DB_SSL_REJECT_UNAUTHORIZED", value = "false" },
        { name = "REDIS_HOST", value = "127.0.0.1" },
        { name = "REDIS_PORT", value = "6379" },
        { name = "REDIS_TLS", value = "false" },
        { name = "ML_ENGINE_URL", value = "http://127.0.0.1:8000" },
        { name = "ML_SERVICE_URL", value = "http://127.0.0.1:8000" },
        { name = "ML_CLASSIFY_TIMEOUT", value = "3000" },
        { name = "FRONTEND_ORIGINS", value = "http://${aws_lb.main.dns_name}" },
        { name = "JWT_ACCESS_TTL", value = "900" },
        { name = "JWT_REFRESH_TTL", value = "604800" },
        { name = "AWS_REGION", value = var.aws_region },
        { name = "S3_MEDIA_BUCKET", value = aws_s3_bucket.media.bucket },
      ]
      secrets = [
        { name = "DB_PASSWORD", valueFrom = "${aws_db_instance.main.master_user_secret[0].secret_arn}:password::" },
        { name = "JWT_SECRET", valueFrom = "${aws_secretsmanager_secret.application.arn}:JWT_SECRET::" },
        { name = "SUPABASE_URL", valueFrom = "${aws_secretsmanager_secret.application.arn}:SUPABASE_URL::" },
        { name = "SUPABASE_SERVICE_KEY", valueFrom = "${aws_secretsmanager_secret.application.arn}:SUPABASE_SERVICE_KEY::" },
        { name = "SUPABASE_BUCKET", valueFrom = "${aws_secretsmanager_secret.application.arn}:SUPABASE_BUCKET::" },
        { name = "GEMINI_API_KEY", valueFrom = "${aws_secretsmanager_secret.application.arn}:GEMINI_API_KEY::" },
        { name = "SMTP_HOST", valueFrom = "${aws_secretsmanager_secret.application.arn}:SMTP_HOST::" },
        { name = "SMTP_PORT", valueFrom = "${aws_secretsmanager_secret.application.arn}:SMTP_PORT::" },
        { name = "SMTP_USER", valueFrom = "${aws_secretsmanager_secret.application.arn}:SMTP_USER::" },
        { name = "SMTP_PASSWORD", valueFrom = "${aws_secretsmanager_secret.application.arn}:SMTP_PASSWORD::" },
        { name = "SMTP_FROM", valueFrom = "${aws_secretsmanager_secret.application.arn}:SMTP_FROM::" },
      ]
      healthCheck = {
        command     = ["CMD-SHELL", "wget -q -O - http://127.0.0.1:3000/api/v1/health >/dev/null || exit 1"]
        interval    = 30
        timeout     = 10
        retries     = 3
        startPeriod = 30
      }
      logConfiguration = {
        logDriver = "awslogs"
        options = {
          "awslogs-group"         = aws_cloudwatch_log_group.backend.name
          "awslogs-region"        = var.aws_region
          "awslogs-stream-prefix" = "ecs"
        }
      }
    },
  ])

  depends_on = [aws_secretsmanager_secret_version.application]
}

resource "aws_ecs_service" "frontend" {
  count = var.deploy_services ? 1 : 0

  name            = "${local.name}-frontend"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.frontend.arn
  desired_count   = 1
  launch_type     = "FARGATE"

  health_check_grace_period_seconds = 60

  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }

  network_configuration {
    subnets          = [aws_subnet.private_app_a.id]
    security_groups  = [aws_security_group.frontend.id]
    assign_public_ip = false
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.frontend.arn
    container_name   = "frontend"
    container_port   = 80
  }

  depends_on = [aws_lb_listener.http]
}

resource "aws_ecs_service" "backend" {
  count = var.deploy_services ? 1 : 0

  name            = "${local.name}-backend"
  cluster         = aws_ecs_cluster.main.id
  task_definition = aws_ecs_task_definition.backend.arn
  desired_count   = 1
  launch_type     = "FARGATE"

  health_check_grace_period_seconds = 120

  deployment_circuit_breaker {
    enable   = true
    rollback = true
  }

  network_configuration {
    subnets          = [aws_subnet.private_app_a.id]
    security_groups  = [aws_security_group.backend.id]
    assign_public_ip = false
  }

  load_balancer {
    target_group_arn = aws_lb_target_group.backend.arn
    container_name   = "backend"
    container_port   = 3000
  }

  depends_on = [
    aws_lb_listener_rule.api,
    aws_lb_listener_rule.tracking,
  ]
}
