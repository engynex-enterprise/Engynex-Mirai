# Bloques moved: el stack v6 (infra/terraform/stack) llamaba a los módulos de modules/* directamente; desde v7 cada
# llamada pasa por su capacidad (capabilities/<cap>/gcp → module.this). Con estos bloques, un estado creado con el
# stack anterior (mismo prefijo de backend: envs/pruebas y envs/produccion) se reubica sin destruir nada.
# Generado a partir de los recursos de modules/*; si agregas un recurso a un módulo envuelto, no hace falta moved.

moved {
  from = module.network.google_compute_network.this
  to   = module.network.module.this.google_compute_network.this
}

moved {
  from = module.network.google_compute_subnetwork.run
  to   = module.network.module.this.google_compute_subnetwork.run
}

moved {
  from = module.network.google_compute_global_address.private_services
  to   = module.network.module.this.google_compute_global_address.private_services
}

moved {
  from = module.network.google_service_networking_connection.private_services
  to   = module.network.module.this.google_service_networking_connection.private_services
}

moved {
  from = module.network.google_compute_firewall.deny_ingress
  to   = module.network.module.this.google_compute_firewall.deny_ingress
}

moved {
  from = module.network.google_compute_router.this
  to   = module.network.module.this.google_compute_router.this
}

moved {
  from = module.network.google_compute_address.nat
  to   = module.network.module.this.google_compute_address.nat
}

moved {
  from = module.network.google_compute_router_nat.this
  to   = module.network.module.this.google_compute_router_nat.this
}

moved {
  from = module.iam.google_service_account.this
  to   = module.iam.module.this.google_service_account.this
}

moved {
  from = module.iam.google_project_iam_member.roles
  to   = module.iam.module.this.google_project_iam_member.roles
}

moved {
  from = module.secrets.google_secret_manager_secret.this
  to   = module.secrets.module.this.google_secret_manager_secret.this
}

moved {
  from = module.secrets.google_secret_manager_secret_iam_member.accessors
  to   = module.secrets.module.this.google_secret_manager_secret_iam_member.accessors
}

moved {
  from = module.secrets.google_secret_manager_secret_version.generated
  to   = module.secrets.module.this.google_secret_manager_secret_version.generated
}

moved {
  from = module.web.google_cloud_run_v2_service.this
  to   = module.web.module.this.google_cloud_run_v2_service.this
}

moved {
  from = module.web.google_cloud_run_v2_service_iam_member.invokers
  to   = module.web.module.this.google_cloud_run_v2_service_iam_member.invokers
}

moved {
  from = module.api.google_cloud_run_v2_service.this
  to   = module.api.module.this.google_cloud_run_v2_service.this
}

moved {
  from = module.api.google_cloud_run_v2_service_iam_member.invokers
  to   = module.api.module.this.google_cloud_run_v2_service_iam_member.invokers
}

moved {
  from = module.realtime[0].google_cloud_run_v2_service.this
  to   = module.realtime[0].module.this.google_cloud_run_v2_service.this
}

moved {
  from = module.realtime[0].google_cloud_run_v2_service_iam_member.invokers
  to   = module.realtime[0].module.this.google_cloud_run_v2_service_iam_member.invokers
}

moved {
  from = module.storage[0].google_storage_bucket.this
  to   = module.storage[0].module.this.google_storage_bucket.this
}

moved {
  from = module.storage[0].google_storage_bucket_iam_member.public_read
  to   = module.storage[0].module.this.google_storage_bucket_iam_member.public_read
}

moved {
  from = module.storage[0].google_storage_bucket_iam_member.admins
  to   = module.storage[0].module.this.google_storage_bucket_iam_member.admins
}

moved {
  from = module.storage[0].google_storage_bucket_iam_member.viewers
  to   = module.storage[0].module.this.google_storage_bucket_iam_member.viewers
}

moved {
  from = module.cloud_sql[0].google_sql_database_instance.this
  to   = module.cloud_sql[0].module.this.google_sql_database_instance.this
}

moved {
  from = module.cloud_sql[0].google_sql_database.app
  to   = module.cloud_sql[0].module.this.google_sql_database.app
}

moved {
  from = module.cloud_sql[0].google_sql_user.service_accounts
  to   = module.cloud_sql[0].module.this.google_sql_user.service_accounts
}

moved {
  from = module.cloud_sql[0].google_sql_user.people
  to   = module.cloud_sql[0].module.this.google_sql_user.people
}

moved {
  from = module.redis[0].google_redis_instance.this
  to   = module.redis[0].module.this.google_redis_instance.this
}

moved {
  from = module.lb[0].google_compute_global_address.v4
  to   = module.lb[0].module.this.google_compute_global_address.v4
}

moved {
  from = module.lb[0].google_compute_global_address.v6
  to   = module.lb[0].module.this.google_compute_global_address.v6
}

moved {
  from = module.lb[0].google_compute_security_policy.this
  to   = module.lb[0].module.this.google_compute_security_policy.this
}

moved {
  from = module.lb[0].google_compute_region_network_endpoint_group.run
  to   = module.lb[0].module.this.google_compute_region_network_endpoint_group.run
}

moved {
  from = module.lb[0].google_compute_backend_service.run
  to   = module.lb[0].module.this.google_compute_backend_service.run
}

moved {
  from = module.lb[0].google_compute_backend_bucket.this
  to   = module.lb[0].module.this.google_compute_backend_bucket.this
}

moved {
  from = module.lb[0].google_compute_url_map.https
  to   = module.lb[0].module.this.google_compute_url_map.https
}

moved {
  from = module.lb[0].google_compute_url_map.redirect
  to   = module.lb[0].module.this.google_compute_url_map.redirect
}

moved {
  from = module.lb[0].google_compute_ssl_policy.this
  to   = module.lb[0].module.this.google_compute_ssl_policy.this
}

moved {
  from = module.lb[0].google_certificate_manager_dns_authorization.this
  to   = module.lb[0].module.this.google_certificate_manager_dns_authorization.this
}

moved {
  from = module.lb[0].google_certificate_manager_certificate.this
  to   = module.lb[0].module.this.google_certificate_manager_certificate.this
}

moved {
  from = module.lb[0].google_certificate_manager_certificate_map.this
  to   = module.lb[0].module.this.google_certificate_manager_certificate_map.this
}

moved {
  from = module.lb[0].google_certificate_manager_certificate_map_entry.hosts
  to   = module.lb[0].module.this.google_certificate_manager_certificate_map_entry.hosts
}

moved {
  from = module.lb[0].google_certificate_manager_certificate_map_entry.primary
  to   = module.lb[0].module.this.google_certificate_manager_certificate_map_entry.primary
}

moved {
  from = module.lb[0].google_compute_target_https_proxy.this
  to   = module.lb[0].module.this.google_compute_target_https_proxy.this
}

moved {
  from = module.lb[0].google_compute_target_http_proxy.redirect
  to   = module.lb[0].module.this.google_compute_target_http_proxy.redirect
}

moved {
  from = module.lb[0].google_compute_global_forwarding_rule.https_v4
  to   = module.lb[0].module.this.google_compute_global_forwarding_rule.https_v4
}

moved {
  from = module.lb[0].google_compute_global_forwarding_rule.http_v4
  to   = module.lb[0].module.this.google_compute_global_forwarding_rule.http_v4
}

moved {
  from = module.lb[0].google_compute_global_forwarding_rule.https_v6
  to   = module.lb[0].module.this.google_compute_global_forwarding_rule.https_v6
}

moved {
  from = module.lb[0].google_compute_global_forwarding_rule.http_v6
  to   = module.lb[0].module.this.google_compute_global_forwarding_rule.http_v6
}

moved {
  from = module.tasks.google_cloud_tasks_queue.this
  to   = module.tasks.module.this[0].google_cloud_tasks_queue.this
}

moved {
  from = module.tasks.google_cloud_tasks_queue_iam_member.enqueuers
  to   = module.tasks.module.this[0].google_cloud_tasks_queue_iam_member.enqueuers
}

moved {
  from = module.scheduler.google_cloud_scheduler_job.this
  to   = module.scheduler.module.this.google_cloud_scheduler_job.this
}

moved {
  from = module.monitoring.google_monitoring_notification_channel.email
  to   = module.monitoring.module.this.google_monitoring_notification_channel.email
}

moved {
  from = module.monitoring.google_monitoring_alert_policy.run_5xx
  to   = module.monitoring.module.this.google_monitoring_alert_policy.run_5xx
}

moved {
  from = module.monitoring.google_monitoring_alert_policy.run_latency
  to   = module.monitoring.module.this.google_monitoring_alert_policy.run_latency
}

moved {
  from = module.monitoring.google_monitoring_uptime_check_config.this
  to   = module.monitoring.module.this.google_monitoring_uptime_check_config.this
}

moved {
  from = module.monitoring.google_monitoring_alert_policy.uptime
  to   = module.monitoring.module.this.google_monitoring_alert_policy.uptime
}

moved {
  from = module.monitoring.google_monitoring_alert_policy.sql
  to   = module.monitoring.module.this.google_monitoring_alert_policy.sql
}

moved {
  from = module.monitoring.google_monitoring_alert_policy.redis_memory
  to   = module.monitoring.module.this.google_monitoring_alert_policy.redis_memory
}

moved {
  from = module.monitoring.google_monitoring_alert_policy.queue_depth
  to   = module.monitoring.module.this.google_monitoring_alert_policy.queue_depth
}

moved {
  from = module.monitoring.google_logging_metric.scheduler_failures
  to   = module.monitoring.module.this.google_logging_metric.scheduler_failures
}

moved {
  from = module.monitoring.google_logging_metric.app_errors
  to   = module.monitoring.module.this.google_logging_metric.app_errors
}

moved {
  from = module.monitoring.google_monitoring_alert_policy.scheduler_failures
  to   = module.monitoring.module.this.google_monitoring_alert_policy.scheduler_failures
}

moved {
  from = module.monitoring.google_monitoring_alert_policy.app_errors
  to   = module.monitoring.module.this.google_monitoring_alert_policy.app_errors
}

moved {
  from = module.budget[0].google_billing_budget.this
  to   = module.budget[0].module.this.google_billing_budget.this
}
