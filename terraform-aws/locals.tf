locals {
  name = "${var.project_name}-${var.environment}"

  common_tags = {
    Project     = var.project_name
    Environment = var.environment
    ManagedBy   = "Terraform"
  }

  app_secret_payload = {
    JWT_SECRET           = random_password.jwt_secret.result
    SUPABASE_URL         = lookup(var.application_secrets, "SUPABASE_URL", "")
    SUPABASE_SERVICE_KEY = lookup(var.application_secrets, "SUPABASE_SERVICE_KEY", "")
    SUPABASE_BUCKET      = lookup(var.application_secrets, "SUPABASE_BUCKET", "media")
    GEMINI_API_KEY       = lookup(var.application_secrets, "GEMINI_API_KEY", "")
    SMTP_HOST            = lookup(var.application_secrets, "SMTP_HOST", "")
    SMTP_PORT            = lookup(var.application_secrets, "SMTP_PORT", "587")
    SMTP_USER            = lookup(var.application_secrets, "SMTP_USER", "")
    SMTP_PASSWORD        = lookup(var.application_secrets, "SMTP_PASSWORD", "")
    SMTP_FROM            = lookup(var.application_secrets, "SMTP_FROM", "")
  }
}

