# object-storage (GCP): Cloud Storage (envuelve modules/storage). writers → objectAdmin, readers → objectViewer.
# La API firma URL V4 sin llaves (signBlob sobre su propia cuenta). cloud_options: location (por defecto la región).

module "this" {
  source     = "../../../modules/storage"
  project_id = var.context.cloud.project_id
  location   = try(var.cloud_options.location, upper(var.context.region))
  labels     = var.context.labels

  buckets = {
    for k, b in var.buckets : k => {
      name                = b.name
      public_read         = b.public_read
      versioning          = b.versioning
      soft_delete_days    = b.soft_delete_days
      noncurrent_ttl_days = b.noncurrent_ttl_days
      cors_origins        = b.cors_origins
      cors_methods        = b.cors_methods
      force_destroy       = b.force_destroy
      object_admins       = b.writers
      object_viewers      = b.readers
      lifecycle           = [for l in b.lifecycle : { prefix = l.prefix, age_days = l.age_days }]
    }
  }
}
