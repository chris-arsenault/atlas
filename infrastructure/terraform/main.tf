terraform {
  required_version = ">= 1.14"
  required_providers {
    aws     = { source = "hashicorp/aws", version = "~> 6.0" }
    archive = { source = "hashicorp/archive", version = "~> 2.0" }
  }
  backend "s3" {
    region       = "us-east-1"
    key          = "projects/atlas.tfstate"
    encrypt      = true
    use_lockfile = true
  }
}
provider "aws" {
  region = "us-east-1"
  default_tags { tags = { Project = "atlas", ManagedBy = "Terraform" } }
}
data "aws_caller_identity" "this" {}
module "ctx" {
  source            = "../../.ahara-tf-patterns/modules/platform-context"
  pipelines_enabled = true
}
data "aws_ssm_parameter" "otlp" { name = "/ahara/observability/otlp-http-endpoint" }
variable "hostname" {
  type    = string
  default = "atlas.ahara.io"
}
variable "schedule_enabled" {
  type    = bool
  default = false
}

resource "aws_s3_bucket" "data" { bucket = "atlas-data-${data.aws_caller_identity.this.account_id}" }
resource "aws_s3_bucket_public_access_block" "data" {
  bucket                  = aws_s3_bucket.data.id
  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}
resource "aws_s3_bucket_server_side_encryption_configuration" "data" {
  bucket = aws_s3_bucket.data.id
  rule {
    apply_server_side_encryption_by_default { sse_algorithm = "AES256" }
  }
}
resource "aws_s3_bucket_versioning" "data" {
  bucket = aws_s3_bucket.data.id
  versioning_configuration { status = "Enabled" }
}
resource "aws_s3_bucket_lifecycle_configuration" "data" {
  bucket = aws_s3_bucket.data.id
  rule {
    id     = "expire-intermediates"
    status = "Enabled"
    filter { prefix = "staging/" }
    expiration { days = 7 }
    noncurrent_version_expiration { noncurrent_days = 7 }
    abort_incomplete_multipart_upload { days_after_initiation = 1 }
  }
}
resource "aws_s3_bucket_policy" "data" {
  bucket = aws_s3_bucket.data.id
  policy = jsonencode({ Version = "2012-10-17", Statement = [
    { Effect = "Allow", Principal = { Service = "cloudfront.amazonaws.com" }, Action = "s3:GetObject", Resource = "${aws_s3_bucket.data.arn}/published/data/*", Condition = { StringEquals = { "AWS:SourceArn" = module.website.distribution_arn } } },
    { Effect = "Deny", Principal = "*", Action = "s3:*", Resource = [aws_s3_bucket.data.arn, "${aws_s3_bucket.data.arn}/*"], Condition = { Bool = { "aws:SecureTransport" = "false" } } }
  ] })
}
resource "aws_iam_role" "worker" {
  name               = "atlas-data-worker"
  assume_role_policy = jsonencode({ Version = "2012-10-17", Statement = [{ Effect = "Allow", Principal = { Service = "lambda.amazonaws.com" }, Action = "sts:AssumeRole" }] })
}
resource "aws_iam_role_policy_attachment" "worker" {
  for_each   = toset(["AWSLambdaBasicExecutionRole", "AWSLambdaVPCAccessExecutionRole"])
  role       = aws_iam_role.worker.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/${each.value}"
}
resource "aws_iam_role_policy" "worker" {
  role = aws_iam_role.worker.id
  policy = jsonencode({ Version = "2012-10-17", Statement = [
    { Effect = "Allow", Action = ["s3:ListBucket"], Resource = aws_s3_bucket.data.arn, Condition = { StringLike = { "s3:prefix" = ["sources/*", "staging/*", "published/data/*"] } } },
    { Effect = "Allow", Action = ["s3:GetObject", "s3:PutObject", "s3:AbortMultipartUpload"], Resource = ["${aws_s3_bucket.data.arn}/sources/*", "${aws_s3_bucket.data.arn}/staging/*", "${aws_s3_bucket.data.arn}/published/data/*"] }
  ] })
}
module "worker" {
  source                         = "../../.ahara-tf-patterns/modules/lambda"
  name                           = "atlas-data-worker"
  package_file                   = "${path.module}/../../.cache/lambda.zip"
  runtime                        = "python3.12"
  handler                        = "atlas_data.worker.handler"
  role_arn                       = aws_iam_role.worker.arn
  vpc                            = module.ctx.vpc
  timeout                        = 900
  memory_size                    = 8192
  ephemeral_storage              = 10240
  reserved_concurrent_executions = 4
  environment = {
    DATA_BUCKET                 = aws_s3_bucket.data.id
    OTEL_EXPORTER_OTLP_ENDPOINT = data.aws_ssm_parameter.otlp.value
    DEPLOYMENT_ENVIRONMENT      = "production"
    TIPPECANOE_MAX_THREADS      = "4"
    ATLAS_ROOT                  = "/var/task"
    PATH                        = "/var/task/bin:/var/lang/bin:/usr/local/bin:/usr/bin:/bin:/opt/bin"
    LD_LIBRARY_PATH             = "/var/task/lib:/var/lang/lib:/lib64:/usr/lib64:/var/runtime:/var/task:/opt/lib"
  }
  depends_on = [aws_iam_role_policy.worker, aws_iam_role_policy_attachment.worker]
}
module "languages" {
  source               = "../../.ahara-tf-patterns/modules/pipeline"
  prefix               = "atlas"
  name                 = "languages"
  owner                = "chris-arsenault/atlas"
  description          = "Pinned full language catalogue, geographic observations, and sourced historical claims."
  definition           = templatefile("${path.module}/../../pipelines/language-atlas/workflow.asl.json", { worker_arn = module.worker.function_arn })
  lambda_function_arns = [module.worker.function_arn]
  schedule_expression  = "cron(0 4 ? * SUN *)"
  enabled              = var.schedule_enabled
  platform             = module.ctx.pipelines
}
resource "aws_cloudfront_response_headers_policy" "security" {
  name = "atlas-security"
  security_headers_config {
    content_type_options { override = true }
    frame_options {
      frame_option = "DENY"
      override     = true
    }
    referrer_policy {
      referrer_policy = "strict-origin-when-cross-origin"
      override        = true
    }
    strict_transport_security {
      access_control_max_age_sec = 31536000
      include_subdomains         = true
      override                   = true
    }
    content_security_policy {
      content_security_policy = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self'; worker-src 'self' blob:; object-src 'none'; base-uri 'self'; form-action 'none'; frame-ancestors 'none'"
      override                = true
    }
  }
}
module "website" {
  source                     = "../../.ahara-tf-patterns/modules/website"
  prefix                     = "atlas"
  hostname                   = var.hostname
  site_directory             = "${path.module}/../../frontend/dist"
  encrypt                    = false
  spa_fallback               = false
  response_headers_policy_id = aws_cloudfront_response_headers_policy.security.id
  data_origin                = { domain_name = aws_s3_bucket.data.bucket_regional_domain_name, origin_path = "/published" }
  invalidation_paths         = ["/", "/index.html", "/config.js", "/assets/*", "/favicon*", "/apple-touch-icon.png", "/icon-192.png", "/icon-512.png", "/manifest.webmanifest", "/og-image.png"]
  vpc                        = module.ctx.vpc
  og_artifact                = module.ctx.og_server
  og_config = {
    site_name = "Atlas"
    defaults = {
      title       = "Languages across place and time"
      description = "Explore language distributions and ancestry, with the evidence kept in view."
      image       = "/og-image.png"
    }
  }
}
output "workflow_arn" { value = module.languages.workflow_arn }
output "data_bucket" { value = aws_s3_bucket.data.id }
output "distribution_id" { value = module.website.distribution_id }
