resource "aws_db_subnet_group" "main" {
  name = "${local.name}-db-subnets"
  subnet_ids = [
    aws_subnet.private_db_a.id,
    aws_subnet.private_db_b.id,
  ]

  tags = { Name = "${local.name}-db-subnets" }
}

resource "aws_db_instance" "main" {
  identifier = "${local.name}-postgres"

  engine         = "postgres"
  engine_version = "16"
  instance_class = var.db_instance_class

  allocated_storage     = var.db_allocated_storage
  max_allocated_storage = 100
  storage_type          = "gp3"
  storage_encrypted     = true

  db_name                     = var.db_name
  username                    = var.db_username
  manage_master_user_password = true
  port                        = 5432

  availability_zone      = data.aws_availability_zones.available.names[0]
  multi_az               = false
  publicly_accessible    = false
  db_subnet_group_name   = aws_db_subnet_group.main.name
  vpc_security_group_ids = [aws_security_group.database.id]

  backup_retention_period = 1
  maintenance_window      = "sun:18:00-sun:19:00"
  backup_window           = "17:00-18:00"

  auto_minor_version_upgrade   = true
  apply_immediately            = true
  deletion_protection          = false
  performance_insights_enabled = false
  skip_final_snapshot          = var.skip_final_db_snapshot
  final_snapshot_identifier    = var.skip_final_db_snapshot ? null : "${local.name}-final"

  tags = { Name = "${local.name}-postgres", Deployment = "single-az" }
}

