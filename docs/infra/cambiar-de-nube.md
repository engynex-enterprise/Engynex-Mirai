# Cambiar de nube: GCP ↔ AWS ↔ Azure

> V7-K/L/M/N/O (docs/arquitectura/v7-gcp-total.md §3.11–§3.12). Escrito el 2026-11-02. Nada de esto se ha aplicado:
> no hay cuentas de AWS ni Azure y GCP espera el bootstrap (C1). Todo está validado sin nube (`fmt`, `validate`,
> `terraform test` con proveedores simulados y la prueba de contrato).

**Requisito del dueño:** *"que quede la infraestructura como código de forma que si ya no me sirve GCP pueda migrar a
AWS, Azure u otra plataforma"*. Respuesta: cambiar de nube es **aplicar otra raíz** (`clouds/<nube>/envs/<ambiente>`)
con el **mismo** `terraform.tfvars` de la app, cambiar una variable en GitHub (`MIRAI_CLOUD`) y mover los datos. No se
reescribe la app ni se rediseña la infraestructura.

## 1. Cómo está organizado

```
infra/terraform/
  capabilities/<capacidad>/{gcp,aws,azure}/   una capacidad = un contrato y tres implementaciones
      variables.tf   ← EL CONTRATO: idéntico byte a byte en las tres nubes (lo revisa scripts/contrato.py)
      main.tf        ← la implementación de esa nube (comentario inicial: cómo traduce el contrato y sus cloud_options)
      outputs.tf     ← las mismas salidas en las tres (scripts/contrato.py › SALIDAS)
  capabilities/app-config/   SIN nube: variables de entorno de cada servicio, catálogo de secretos, orígenes, rutas del
                             mismo origen y NEXT_PUBLIC_* del build. Lo usan los tres stacks → la app ve lo mismo en
                             cualquier nube. Tiene sus propias pruebas.
  clouds/<nube>/stack/       compone las capacidades de esa nube para un ambiente
      variables-comunes.tf   ← idéntico en las tres nubes (mismas variables de la app)
      variables-<nube>.tf    ← lo propio de la nube (proyecto, suscripción, registro…)
      outputs-comunes.tf     ← los mismos nombres de salida en las tres (edge_address, dns_records, ci_variables…)
      tests/stack.tftest.hcl ← pruebas con proveedores simulados
  clouds/<nube>/envs/{bootstrap,pruebas,produccion}/   raíces que se aplican (estado remoto en la nube)
  modules/                   módulos GCP de v6; capabilities/*/gcp los envuelven (no se reescribieron)
  scripts/contrato.py        prueba de contrato (corre en CI)
infra/deploy/<nube>/{desplegar,migrar}.sh    despliegue con canario/vuelta atrás y migraciones, misma interfaz
.github/workflows/{ci,deploy,_desplegar,terraform}.yml   CI/CD principal (Cloud Build queda como alternativa en GCP)
infra/docker/web.Dockerfile · apps/api/Dockerfile        las mismas imágenes en cualquier nube
infra/otel/collector.<nube>.yaml                          colector OpenTelemetry por nube (sidecar, features.otel)
```

### 1.1 Capacidades y equivalencias

| Capacidad | GCP | AWS | Azure |
|---|---|---|---|
| network | VPC + subred Cloud Run + Private Services Access + Cloud NAT | VPC, subredes públicas/privadas por zona, NAT Gateway, endpoint de S3 | VNet con subredes delegadas (ACA, Postgres), NAT Gateway, DNS privado |
| container-platform | (nada: Cloud Run es del proyecto) | Clúster ECS + Service Connect + ALB interno | Entorno de Container Apps + Log Analytics |
| identity | Cuentas de servicio | Roles de IAM de tarea | Identidades administradas |
| container-service | Cloud Run v2 | ECS Fargate + grupo de destino y reglas del ALB | Container App (revisiones múltiples) |
| postgres | Cloud SQL PG 17 (HA regional) | RDS PostgreSQL 17 (Multi-AZ) | Flexible Server 17 (HA por zona) |
| redis | Memorystore | ElastiCache (TLS) | Azure Cache for Redis (TLS) |
| object-storage | Cloud Storage (3 buckets) | S3 (3 buckets) | 3 cuentas de almacenamiento, contenedor `objetos` |
| queue | Cloud Tasks (empuja a la API) | SQS + DLQ (consume el worker) | Service Bus con detección de duplicados (consume el worker) |
| scheduler | Cloud Scheduler (OIDC) | EventBridge Scheduler → tarea con curl (`Bearer CRON_SECRET`) | Container Apps Job con cron (UTC) y curl |
| secrets | Secret Manager | Secrets Manager | Key Vault (RBAC) |
| registry | Artifact Registry | ECR (un repo por imagen) | ACR |
| edge | ALB global + Cloud CDN + Cloud Armor + Certificate Manager | CloudFront (VPC origin → ALB interno) + WAF + ACM | Front Door Premium + WAF + certificados administrados |
| dns (opcional) | Cloud DNS | Route 53 | Azure DNS |
| monitoring | Cloud Monitoring | CloudWatch + SNS | Azure Monitor + Action Group |
| budget | Billing budget | AWS Budgets | Consumption budget |
| ci-identity | Workload Identity Federation | Proveedor OIDC de IAM + roles | App de Entra + credenciales federadas |

## 2. Qué NO cambia al cambiar de nube

- **El código.** La API lee drivers por variable (`OBJECT_STORE`, `QUEUE_DRIVER`, `AI_PLATFORM_PROVIDER`,
  `DB_ADAPTER`, `AUTH_PROVIDER`, `SECRETS_SOURCE=env`); los SDK de nube viven solo en `apps/api/src/adapters/<nube>`.
- **Las imágenes.** `apps/api/Dockerfile` (una imagen para `MODE=api|realtime|worker`) y `infra/docker/web.Dockerfile`
  (Next.js `output: "standalone"`). Mientras no exista la configuración pública en tiempo de ejecución (D16), la web se
  compila por ambiente con `WEB_BUILD_ENV`.
- **El `terraform.tfvars` de la app**: `features`, `domains`, `public_config`, `api_env`/`realtime_env`/`worker_env`/
  `web_env`, `optional_secrets`, `auth_provider`, `db_adapter`, `live_source`, tamaños (`services`, `postgres`, `redis`),
  `waf`, `alert_emails`, `budget`. Mismos nombres en las tres raíces (`variables-comunes.tf`).
- **Las variables de entorno y los secretos** (nombres y quién los monta): salen de `capabilities/app-config`. Los
  generados por la infraestructura (`DATABASE_URL`, `REDIS_URL`, `BETTER_AUTH_SECRET`, JWT de PostgREST) se vuelven a
  generar en la nube nueva. **Ojo:** `BETTER_AUTH_SECRET` cifra el TOTP; si se cambia, hay que copiar el valor viejo
  (ver §4, paso 4).
- **Las rutas del mismo origen** (D2): `/v1/*` y `/api/auth/*` → API, `/socket.io/*` → gateway, `/*` → web, `files.` →
  bucket público; `api.` y `rt.` siguen para webhooks, Google y clientes externos.
- **Los dominios** (`mirai.engynex.com`, `pruebas.`, `api.`, `files.`…). Solo cambian los registros en Hostinger
  (salida `dns_records`).
- **Las rutas de los archivos** (`attachments/{book_id}/…`, `avatars/…`): son prefijos dentro de los buckets.
- **El flujo de CI/CD**: `deploy.yml` y `_desplegar.yml` son los mismos; los scripts `infra/deploy/<nube>/*.sh` tienen la
  misma interfaz (`MIRAI_ENV`, `SERVICE`, `IMAGE`, `CANARY_URL`, `STEPS`, `BAKE`, `MAX_RATIO`).

## 3. Qué SÍ cambia (y se acepta)

| Tema | GCP | AWS | Azure |
|---|---|---|---|
| Canario | Revisión sin tráfico etiquetada `canary`, humo por `canary.*`, 10 % → 50 % → 100 % mirando 5xx | Reemplazo gradual con circuit breaker + alarma de 5xx que revierte sola (sin dominios canary) | Revisión con etiqueta `canary` (`<app>---canary.<dominio>`), pasos de tráfico; realtime en modo de una revisión (sesiones pegajosas) |
| Colas | Cloud Tasks empuja: **sin worker** | SQS + `MODE=worker` (o `aws.queue_enabled=false` → `QUEUE_DRIVER=http`, sin worker) | Service Bus + `MODE=worker` (o `azure.queue_driver="http"`, sin worker) |
| Cron | OIDC de Google (`SCHEDULER_AUDIENCE`/`SCHEDULER_SERVICE_ACCOUNTS`) | `Bearer CRON_SECRET` desde una tarea de ECS | `Bearer CRON_SECRET` desde un Container Apps Job; los horarios se convierten a UTC (Bogotá = UTC−5) |
| IA de la plataforma | Vertex AI (`AI_PLATFORM_PROVIDER=vertex`, `roles/aiplatform.user`) | Bedrock (`bedrock`, `AI_BEDROCK_REGION`, `bedrock:InvokeModel*`) | Azure OpenAI (`azure`, `AZURE_OPENAI_ENDPOINT`, rol Cognitive Services OpenAI User) si hay `azure.openai_endpoint` |
| Archivos | `OBJECT_STORE=gcs`, URL firmadas V4 sin llaves (`serviceAccountTokenCreator` sobre sí misma) | `s3`, URL prefirmadas con el rol de la tarea | `azure-blob`, SAS de delegación (Blob Data Contributor + Delegator) |
| WAF | Reglas preconfiguradas de Cloud Armor | Reglas administradas de AWS (en conteo con `waf_preview`) | DefaultRuleSet 2.1 + BotManager (Detection con `waf_preview`) |
| Tiempo máximo por petición | 300 s (3600 en realtime) | Idle timeout del ALB | **240 s** (Front Door y Container Apps): el chat en streaming debe mandar datos antes |
| Secretos sin valor | El contenedor arranca solo si el secreto montado tiene versión | Igual (Secrets Manager) | Key Vault no admite secretos vacíos: se crean con `REEMPLAZA` y la app **arranca con ese valor** → cargar los obligatorios antes del primer despliegue |
| Roles de Postgres | Terraform crea `mirai_app`, `authenticator` y `mirai_admin` (Cloud SQL los admite por API) | Solo el administrador: la línea base SQL (V7-C) crea los roles con las claves generadas | Igual que AWS (`db-migrate` recibe `MIRAI_APP_DATABASE_URL` y `MIRAI_POSTGREST_DATABASE_URL`) |
| Identity Platform | Adaptador opcional (`gcp.identity_platform.enabled`) | — | — |

## 4. Paso a paso para migrar (ejemplo GCP → AWS; Azure es igual cambiando la columna)

1. **Bootstrap de la nube nueva** (`clouds/aws/envs/bootstrap`): estado remoto, registro, identidades de GitHub. Copiar
   `terraform.tfvars.example`, `terraform init` (estado local la primera vez) y `apply`; luego pasar el estado al bucket.
2. **Ambiente de pruebas** (`clouds/aws/envs/pruebas`): copiar el `terraform.tfvars` de GCP **tal cual** en lo común y
   llenar lo de AWS (`aws.registry_url`, región `us-east-1`). `terraform init -backend-config=backend.hcl` y `apply`.
3. **DNS de validación**: crear en Hostinger los registros de la salida `dns_records` (validación del certificado);
   esperar el certificado emitido antes de mover tráfico.
4. **Secretos**: cargar los manuales con el mismo valor que en la nube vieja, **sin imprimirlos**
   (`gcloud secrets versions access latest --secret mirai-pruebas-encryption-key | aws secretsmanager put-secret-value
   --secret-id mirai-pruebas/encryption-key --secret-string file:///dev/stdin`). Imprescindibles idénticos:
   `ENCRYPTION_KEY` (cifra integraciones), `BETTER_AUTH_SECRET` (cifra el TOTP; reemplaza el generado),
   `VAPID_PRIVATE_KEY` (si cambia se pierden las suscripciones push), `CRON_SECRET` y los de pagos.
5. **GitHub**: en el entorno `pruebas`, poner `MIRAI_CLOUD=aws` y las variables de `terraform output ci_variables` (más
   `AWS_ROLE_ARN` del bootstrap). Correr **Desplegar** a mano con *modo seco* y luego real.
6. **Datos** (ventana corta, como el corte B de v7 §5.2): poner `mantenimiento`, `pg_dump -Fc` de la base vieja →
   `pg_restore` en la nueva (por secciones, §3.7), `scripts/migrate/verify.ts` (conteos y sumas = 0 diferencias),
   copiar los archivos (`node dist/storage-copy.js` de la API o `rclone`/`gsutil -m rsync` → `aws s3 sync`), pausar el
   cron de la nube vieja y encender el de la nueva (`features.scheduler_paused`).
7. **Corte de DNS**: cambiar en Hostinger los A/CNAME de `mirai.engynex.com` (TTL 300 desde 48 h antes) a la salida
   `edge_address` de la nueva. Revisar `/api/public/version`, login, un gasto y un cambio en vivo.
8. **Integraciones externas**: la URL de webhooks de Mercado Pago y Wompi y las URI de Google no cambian (mismo dominio).
   Si Meta/una pasarela tiene IP en lista blanca, dar las `nat_ips` nuevas.
9. **Vuelta atrás**: hasta reabrir escrituras, devolver el DNS a la nube vieja (sigue intacta). Después, copiar a la
   vieja lo que cambió (todas las tablas tienen `updated_at`).
10. **Apagar la vieja** después de 30 días estable: `terraform destroy` del ambiente (quitar antes `deletion_protection`)
    y exportación final cifrada (Ley 1581).

**Otra plataforma** (Kubernetes, Fly, Render, OVH…): escribir `capabilities/<cap>/<plataforma>` con el mismo
`variables.tf` y las salidas de `SALIDAS`, un `clouds/<plataforma>/stack` que use `app-config`, y su
`infra/deploy/<plataforma>/{desplegar,migrar}.sh`. `scripts/contrato.py` dice qué falta.

## 5. Validar sin nube

```bash
cd infra/terraform
terraform fmt -check -recursive .
python3 scripts/contrato.py
for r in clouds/*/envs/*; do terraform -chdir=$r init -backend=false && terraform -chdir=$r validate; done
for d in capabilities/app-config clouds/gcp/stack clouds/aws/stack clouds/azure/stack; do
  terraform -chdir=$d init -backend=false && terraform -chdir=$d test
done
```
Lo mismo corre en CI (`ci.yml` › `infra`), junto con `actionlint` y `bash -n` de los scripts de despliegue.

## 6. Estado de GCP frente a v6 (sin destrucciones)

- `infra/terraform/stack` → `clouds/gcp/stack` y `infra/terraform/envs/*` → `clouds/gcp/envs/*`. Los prefijos del
  backend GCS no cambian (`envs/pruebas`, `envs/produccion`, `bootstrap`).
- `clouds/gcp/stack/moved.tf` (64 bloques) y los `moved` del bootstrap reubican cada recurso de `module.X.<recurso>` a
  `module.X.module.this.<recurso>`: un estado creado con v6 no destruye nada por el cambio de estructura. **No hay estado
  aplicado todavía** (C1 pendiente), así que no se pudo correr un `plan` contra un estado real; se revisó con
  `validate` y `terraform test`.
- Sí cambian a propósito (v7): región por defecto `us-east1` (D12), Cloud SQL como base principal
  (`features.postgres = true`, `db_adapter = "pg"`), `auth_provider = "mirai"`, el mismo origen, `stages` → `features`,
  `armor` → `waf`, `cloud_sql` → `postgres`, `supabase-secret-key` opcional (`features.supabase`), secretos nuevos
  (`better-auth-secret`, `database-admin-url`, `postgrest-*`, `turnstile-secret`), PostgREST, Vertex AI y OTEL. Cambiar
  de `us-west1` a `us-east1` en un ambiente ya creado **sí recrea** los recursos regionales: hacerlo en la ventana del
  corte B o dejar `region = "us-west1"`.
