# secrets (GCP): Secret Manager (envuelve modules/secrets). Contenedor + secretAccessor por accessor; los valores se
# cargan con `gcloud secrets versions add` salvo generated_values.

module "this" {
  source           = "../../../modules/secrets"
  project_id       = var.context.cloud.project_id
  prefix           = var.context.prefix
  labels           = var.context.labels
  secrets          = var.secrets
  generated_values = var.generated_values
}
