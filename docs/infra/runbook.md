# Runbook de infraestructura de Mirai en GCP

> Cómo operar lo que define `infra/` (estrategia en `docs/infra/estrategia-gcp.md`). Todos los comandos asumen la región `us-west1` y los IDs sugeridos (`engynex-mirai-cicd`, `engynex-mirai-pruebas`, `engynex-mirai-prod`); cámbialos si son otros.
> Herramientas: `gcloud` (con `gcloud auth login` y `gcloud auth application-default login`), Terraform ≥ 1.9 (probado con 1.16.4), `curl`. Nunca pegues un secreto en un comando que quede en el historial ni en un chat.

Variables de comodidad para copiar y pegar:

```bash
export REGION=us-west1 CICD=engynex-mirai-cicd PRUEBAS=engynex-mirai-pruebas PROD=engynex-mirai-prod
```

---

## 1. Bootstrap (una sola vez)

### 1.1 Antes de empezar
- Los permisos de la cuenta que aplica están en la estrategia §14 (lo más simple: Owner temporal en los tres proyectos + `billing.user`).
- Si Terraform no crea los proyectos (`create_projects = false`), deben existir y estar vinculados a la cuenta de facturación.

### 1.2 Primer apply (estado local)
```bash
cd infra/terraform/envs/bootstrap
cp terraform.tfvars.example terraform.tfvars   # completa IDs, cuenta de facturación, GitHub, correo
terraform init
terraform plan -out bootstrap.tfplan
terraform apply bootstrap.tfplan
```
Habilita las APIs (tarda 2–5 min), crea el bucket del estado, Artifact Registry, la Workload Identity Federation, las cuentas `mirai-tf-*` y el presupuesto del proyecto `cicd`.

### 1.3 Conectar GitHub con Cloud Build
1. Consola › Cloud Build › Repositorios (2.ª gen.) › **Crear conexión de host** › GitHub, región `us-west1`, nombre `github`. Autoriza e instala la app **Google Cloud Build** solo en el repositorio de Mirai. La consola guarda el token OAuth en un secreto del proyecto `cicd`.
2. Copia en `terraform.tfvars` el ID de instalación (`github_app_installation_id`) y la versión del secreto (`github_oauth_token_secret_version = "projects/…/secrets/…/versions/1"`).
3. Como la conexión ya existe, impórtala y aplica (crea el repositorio vinculado y, si `enable_ci_trigger = true`, el disparador de CI):
   ```bash
   terraform import 'google_cloudbuildv2_connection.github[0]' "projects/$CICD/locations/$REGION/connections/github"
   terraform apply
   terraform output cloudbuild_repository_id
   ```

### 1.4 Pasar el estado al bucket
```bash
terraform output state_bucket
cp backend.tf.example backend.tf      # pon el nombre del bucket
terraform init -migrate-state         # responde "yes"
rm terraform.tfstate terraform.tfstate.backup   # ya está en GCS (con versiones)
```

### 1.5 Retirar permisos temporales
Cuando los ambientes ya se aplican con `mirai-tf-pruebas` y `mirai-tf-produccion` (GitHub Actions con WIF), quita el Owner temporal de la cuenta personal.

---

## 2. Aplicar un ambiente

### 2.1 Inicializar
```bash
cd infra/terraform/envs/pruebas            # o envs/produccion
cp backend.hcl.example backend.hcl         # bucket = salida state_bucket
cp terraform.tfvars.example terraform.tfvars
terraform init -backend-config=backend.hcl
```
Completa `terraform.tfvars` con las salidas del bootstrap (`artifact_registry_path`, `cloudbuild_repository_id`), `public_config` y `stages`. **Ahí no van secretos.**

### 2.2 Primera vez: en dos pasos
Cloud Run no arranca si un secreto montado no tiene valor, así que primero se crean los secretos y las cuentas:
```bash
terraform apply -target=module.mirai.module.iam -target=module.mirai.module.secrets
```

### 2.3 Cargar los valores de los secretos
Para cada secreto (lista: `terraform output secret_ids`), sin que el valor quede en el historial:
```bash
cargar() {  # uso: cargar <proyecto> <secret_id>
  read -rsp "Valor de $2: " V; echo
  printf '%s' "$V" | gcloud secrets versions add "$2" --data-file=- --project "$1"
  unset V
}
cargar $PROD mirai-produccion-supabase-secret-key
cargar $PROD mirai-produccion-encryption-key      # EXACTA la de Vercel
cargar $PROD mirai-produccion-cron-secret         # EXACTA la de Vercel (la usa pg_cron)
```
Los tres anteriores son obligatorios. Los opcionales se cargan cuando estén listos y **después** se agregan a `optional_secrets` en `terraform.tfvars` (si se agregan antes, el despliegue falla).

Para revisar sin mostrar el valor: `gcloud secrets versions list mirai-produccion-encryption-key --project $PROD`.

### 2.4 Apply completo
```bash
terraform plan -out env.tfplan && terraform apply env.tfplan
```
Los servicios quedan con la imagen de ejemplo de Google (`hello`) hasta el primer despliegue de Cloud Build (§4). Para ese primer despliegue, si el certificado aún no está activo, pon `smoke_tests = false` y vuelve a `true` después.

### 2.5 DNS y certificado
```bash
terraform output -json dns_records
```
1. En Hostinger crea **primero** los CNAME `_acme-challenge.<dominio>` (autorización del certificado) y los A de los nombres nuevos (`api`, `files`, `canary`, `canary-api`; en pruebas también el de la web). En producción, `mirai.engynex.com` **solo se cambia en el corte** (estrategia §7, etapa 1).
2. Revisa el certificado (de 15 min a unas horas):
   ```bash
   gcloud certificate-manager certificates describe mirai-produccion-cert --project $PROD \
     --format='value(managed.state, managed.authorizationAttemptInfo)'
   ```
   Debe decir `ACTIVE`. Si dice `AUTHORIZATION_ISSUE`, el CNAME está mal escrito (Hostinger a veces agrega el dominio al final: el nombre va sin `.engynex.com`).
3. Prueba antes de mover el DNS: `curl -sI --resolve mirai.engynex.com:443:<IP> https://mirai.engynex.com/api/public/version`.

### 2.6 Cambiar de etapa
Edita `stages` en `terraform.tfvars` y aplica. Qué enciende cada etapa y cuándo: estrategia §7. Etapa 3 crea Cloud SQL (10–15 min) y Redis (~5 min). Siempre `plan` antes y revisa que nada diga `destroy` en recursos con datos.

---

## 3. Rotar secretos

**Procedimiento general** (claves de pasarelas, Google, Upstash, IA, `SUPABASE_SECRET_KEY`):
1. Genera la clave nueva en el proveedor **sin revocar la vieja** (Supabase, Mercado Pago, Wompi y Google permiten tener dos a la vez).
2. Carga la versión nueva: `cargar <proyecto> <secret_id>` (§2.3).
3. Fuerza revisiones nuevas para que la lean: vuelve a correr los disparadores `deploy-*` del servicio (§4.2). Las instancias que arranquen antes también leen `latest`.
4. Verifica (pruebas de envío, un pago sandbox, `/readyz`).
5. Revoca la clave vieja en el proveedor y deshabilita la versión anterior: `gcloud secrets versions disable <n> --secret <secret_id> --project <proyecto>`.
6. Vuelta atrás: `gcloud secrets versions enable <n-anterior> …` + `disable <n-nueva>` y redesplegar.

**Casos especiales:**
- `ENCRYPTION_KEY`: **no se rota con este procedimiento.** Cifra las integraciones guardadas en la base (formato `v1.iv.tag.data`); cambiarla deja todo ilegible. Rotarla exige un script que descifre con la vieja y cifre con la nueva cada fila de `integrations`, `platform_integrations` y `google_connections`, en una ventana, con las dos claves disponibles. Planearlo aparte.
- `CRON_SECRET`: mientras exista el job `mirai-notify` de pg_cron, cámbialo también ahí: `select public.mirai_schedule_notify('https://mirai.engynex.com', '<nuevo>');` (y en Vercel si sigue activo).
- `VAPID_PRIVATE_KEY`: cambiar la pareja invalida todas las suscripciones push (cada persona tendría que volver a activarlas). Solo si se filtró.
- `redis-auth`: la genera Memorystore y Terraform la copia a Secret Manager. Para cambiarla se recrea la instancia en una ventana (`terraform apply -replace='module.mirai.module.redis[0].google_redis_instance.this'`) y se redespliegan api y realtime. Redis solo guarda presencia y el pub/sub de socket.io: no se pierde nada importante y los sockets reconectan solos.
- Token OAuth de GitHub (conexión de Cloud Build): Consola › Cloud Build › Repositorios › conexión `github` › Actualizar autorización.

---

## 4. Desplegar y revertir

### 4.1 Despliegue normal
- Push a `pruebas` → despliegue en pruebas (sin aprobación).
- Merge a `main` → el build de producción **espera aprobación**: Consola › Cloud Build › Historial › el build › *Aprobar*, o:
  ```bash
  gcloud builds list --region $REGION --project $CICD --filter='status=PENDING' --format='value(id, substitutions._SERVICE)'
  gcloud builds approve <BUILD_ID> --region $REGION --project $CICD
  ```
- Cada build hace humo por `canary.*`, mueve 10 % → 50 % → 100 % y **revierte solo** si la revisión nueva tiene más de 2 % de 5xx. El registro del paso `desplegar` dice qué hizo.

### 4.2 Desplegar a mano (mismo commit de la rama)
```bash
gcloud builds triggers run mirai-produccion-deploy-web --branch=main --region $REGION --project $CICD
```

### 4.3 Revertir a la revisión anterior (segundos)
```bash
gcloud run revisions list --service mirai-produccion-web --region $REGION --project $PROD --limit 5
gcloud run services update-traffic mirai-produccion-web --region $REGION --project $PROD \
  --to-revisions=<revisión-buena>=100
```
Importante: con el tráfico fijo en una revisión, un `terraform apply` que cambie la configuración crea una revisión **sin tráfico**. Cuando el problema se arregle, el siguiente despliegue (o `--to-latest`) vuelve a la normalidad:
```bash
gcloud run services update-traffic mirai-produccion-web --to-latest --region $REGION --project $PROD
```

### 4.4 Revertir un cambio de Terraform
`git revert` del commit en `infra/` y `terraform apply`. Si el cambio rompió un servicio, primero §4.3 para restablecer el tráfico y luego el revert.

### 4.5 Volver a Vercel (solo etapa 1, durante las 4 semanas de respaldo)
En Hostinger, borra el A de `mirai.engynex.com` y vuelve a crear el CNAME al valor de Vercel › Domains. Con TTL 300 el tráfico vuelve en 5–10 min. No hay que tocar la base (es la misma).

---

## 5. Cron y colas

```bash
# Ver, pausar, reanudar y correr ya un trabajo
gcloud scheduler jobs list --location $REGION --project $PROD
gcloud scheduler jobs pause  mirai-produccion-notify-tick --location $REGION --project $PROD
gcloud scheduler jobs resume mirai-produccion-notify-tick --location $REGION --project $PROD
gcloud scheduler jobs run    mirai-produccion-notify-tick --location $REGION --project $PROD

# Colas
gcloud tasks queues describe mirai-produccion-notify --location $REGION --project $PROD
gcloud tasks queues pause  mirai-produccion-notify --location $REGION --project $PROD   # deja de despachar
gcloud tasks queues resume mirai-produccion-notify --location $REGION --project $PROD
gcloud tasks queues purge  mirai-produccion-notify --location $REGION --project $PROD   # borra TODO lo pendiente
```
Una pausa hecha con `gcloud` la deshace el siguiente `terraform apply`; para que dure, usa `stages.scheduler_paused = true`.

**Corte de pg_cron a Scheduler (etapa 2):** simulación 3 días (`scheduler_dry_run = true`, `scheduler_paused = false`) → comparar → `scheduler_dry_run = false` + en Supabase `select cron.unschedule('mirai-notify');` + quitar `crons` de `apps/web/vercel.json`. Vuelta atrás: `scheduler_paused = true` y `select public.mirai_schedule_notify('https://mirai.engynex.com', '<CRON_SECRET>');`.

---

## 6. Cloud Armor

- **Revisar la vista previa del WAF** (lo que se habría bloqueado):
  ```bash
  gcloud logging read 'resource.type="http_load_balancer" AND jsonPayload.previewSecurityPolicy.outcome="DENY"' \
    --project $PROD --freshness 7d --limit 50 \
    --format='table(timestamp, httpRequest.requestUrl, jsonPayload.previewSecurityPolicy.preconfiguredExprIds)'
  ```
  Si una regla bloquea tráfico legítimo (típico: Server Actions o RSC con JSON grande), anota el ID y agrega una exclusión o sube la sensibilidad. Tras 2 semanas limpias: `armor = { waf_preview = false }` y aplica.
- **Bloquear una IP ya:**
  ```bash
  gcloud compute security-policies rules create 110 --security-policy mirai-produccion-armor \
    --src-ip-ranges=203.0.113.7/32 --action=deny-403 --project $PROD
  ```
  Después agrégala a `armor.deny_ip_ranges` y aplica (Terraform borra las reglas que no conoce).
- **Ver lo bloqueado de verdad:** el mismo filtro con `jsonPayload.enforcedSecurityPolicy.outcome="DENY"`; 429 = límite por IP.

---

## 7. Copias y restauración

### 7.1 Cloud SQL (etapa 3)
- Copias diarias (08:00 UTC) en multi-región `us` + PITR. Ver: `gcloud sql backups list --instance mirai-produccion-pg --project $PROD`.
- **Restaurar a un punto en el tiempo** (no toca la instancia actual; crea un clon):
  ```bash
  gcloud sql instances clone mirai-produccion-pg mirai-produccion-pg-pitr \
    --point-in-time '2026-12-01T13:45:00Z' --project $PROD
  ```
  Revisa los datos en el clon, copia lo necesario o cambia la API al clon (`CLOUD_SQL_CONNECTION_NAME`) y luego importa el clon a Terraform o vuelve a la instancia original.
- **Restaurar una copia sobre otra instancia:** `gcloud sql backups restore <BACKUP_ID> --restore-instance=<destino> --backup-instance=mirai-produccion-pg --project $PROD` (borra los datos del destino).
- **Ensayo obligatorio:** una vez al mes en pruebas, clonar a un punto en el tiempo y correr el script de conteos. Anotar el tiempo que tardó.
- Fallo de zona: con HA regional la conmutación es automática (~1 min de cortes de conexión). Forzarla para probar: `gcloud sql instances failover mirai-produccion-pg --project $PROD`.

### 7.2 Cloud Storage
- Borrado suave (7 días; 14 en `backups`): `gcloud storage ls --soft-deleted gs://mirai-produccion-private-engynex/<ruta>` y `gcloud storage restore gs://…/<objeto>#<generación>`.
- Versiones (`backups`): `gcloud storage ls -a gs://mirai-produccion-backups-engynex/<ruta>` y `gcloud storage cp gs://…/<objeto>#<generación> gs://…/<objeto>`.

### 7.3 Estado de Terraform
- Versionado en el bucket: `gcloud storage ls -a gs://engynex-mirai-tfstate/envs/produccion/`. Para volver a una versión, cópiala sobre `default.tfstate` (con nadie aplicando).
- Bloqueo atascado (un apply que murió): `terraform force-unlock <LOCK_ID>` (el ID sale en el error).

### 7.4 Supabase (mientras exista)
Las copias siguen siendo las de Supabase (panel › Database › Backups) y `features/data/backup.ts` para cada libro.

---

## 8. Incidentes

### 8.1 Severidad y comunicación
| Nivel | Ejemplos | Respuesta |
|---|---|---|
| SEV1 | Mirai no carga, no se puede iniciar sesión, pagos fallan, posible filtración | Atender ya; `aviso_global` en la app; post-mortem en 48 h en `docs/HISTORIAL.md` |
| SEV2 | Una sección o los avisos no funcionan, lentitud fuerte | Mismo día |
| SEV3 | Alertas sueltas, costos, advertencias | En la semana |

Primer paso siempre: **¿hubo un despliegue o un `apply` en la última hora?** (`gcloud builds list --region $REGION --project $CICD --limit 5`). Si sí, revertir primero (§4.3) e investigar después.

### 8.2 Guía por alerta
- **5xx alto:** Error Reporting y registros del servicio (`gcloud logging read 'resource.type="cloud_run_revision" AND resource.labels.service_name="mirai-produccion-api" AND severity>=ERROR' --project $PROD --freshness 30m --limit 30`). ¿Supabase caído (status.supabase.com)? ¿Un secreto sin valor o deshabilitado (la revisión no arranca)? ¿Cuota de IA? Si es la revisión nueva → §4.3.
- **Latencia p95:** ¿las instancias están en el máximo? (Cloud Run › Métricas › Instancias) → subir `max_instances`. ¿Arranques en frío? → `min_instances`. ¿Supabase o Cloud SQL lentos? → Query Insights.
- **Disponibilidad (uptime):** `curl -sv https://mirai.engynex.com/api/public/version`. Revisa DNS (`dig +short mirai.engynex.com`), estado del certificado (§2.5) y si Cloud Armor está bloqueando (§6).
- **Cloud SQL CPU/memoria/disco:** Query Insights › consultas más pesadas. Si es carga real, subir `cloud_sql.tier` (reinicia la instancia: con HA son ~1–2 min). El disco crece solo hasta `disk_autoresize_limit_gb`.
- **Falla de Scheduler:** el registro del trabajo dice el código. 401/403 = la API rechazó el token OIDC (audiencia o correo en `JOBS_*`). 5xx = error de la API. Volver a correr: `gcloud scheduler jobs run …`. Los envíos no se duplican (`notify_claim`).
- **Cola acumulada:** ¿la API responde 5xx a `/v1/jobs/*`? Pausa la cola (§5) mientras se arregla; si hay tareas venenosas, purga. Cloud Tasks reintenta con espera creciente.
- **Muchos errores en registros:** agrupar en Error Reporting; puede ser un proveedor externo (Meta, Resend, IA) caído.
- **Webhooks de pagos rechazados:** ¿429 de Cloud Armor en `/api/pagos/*` o `/v1/webhooks/*`? Sube `webhook_rate_limit_per_minute`. ¿Firma inválida? Revisa `MERCADOPAGO_WEBHOOK_SECRET`/`WOMPI_EVENTS_SECRET`. Las pasarelas reintentan; `apply_plan_payment` es idempotente.
- **Ataque o picos anormales:** bajar `rate_limit_per_minute`, bloquear rangos (§6), activar `adaptive_protection`.
- **Presupuesto:** Facturación › Informes por SKU. Sospechosos típicos: instancias mínimas de más, Cloud Build en bucle, registros del balanceador (bajar `lb_log_sample_rate`), salida a internet.

### 8.3 Secreto filtrado
1. Rotar ya (§3), revocando la vieja **inmediatamente** (sin esperar).
2. Revisar quién lo leyó: Registros de auditoría › Data Access de Secret Manager (activarlos si no lo están).
3. `ENCRYPTION_KEY` filtrada = SEV1: planear la recifrado (§3) y rotar las claves de las integraciones que protege.
4. Anotar en `docs/HISTORIAL.md`.

### 8.4 Pasos manuales que Terraform no cubre
- **Error Reporting:** Consola › Error Reporting › *Configurar notificaciones* → elegir los canales de correo `Mirai <ambiente> · …`.
- **Identity Platform (etapa 4):** plantillas de correo en español, dominio del remitente y SMTP propio (Resend) en Identity Platform › Configuración; dominio propio de autenticación si se quiere.
- **Supabase Auth:** URL de redirección de cada dominio nuevo.
- **Cliente OAuth de Google:** orígenes y URI de redirección de cada dominio nuevo.
