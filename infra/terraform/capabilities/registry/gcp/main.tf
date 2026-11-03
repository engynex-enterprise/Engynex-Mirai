# registry (GCP): Artifact Registry Docker (envuelve modules/artifact-registry) en el proyecto de CI/CD
# (context.cloud.project_id). `images` no aplica: todas las imágenes viven en el mismo repositorio.

module "this" {
  source            = "../../../modules/artifact-registry"
  project_id        = var.context.cloud.project_id
  location          = var.context.region
  repository_id     = var.name
  labels            = var.context.labels
  keep_recent       = var.keep_recent
  untagged_ttl_days = var.untagged_ttl_days
  tagged_ttl_days   = var.tagged_ttl_days
  cleanup_dry_run   = var.cleanup_dry_run
  readers           = var.readers
  writers           = var.writers
}
