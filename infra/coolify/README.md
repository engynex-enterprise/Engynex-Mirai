# Mirai en un servidor con Coolify (sin Vercel ni Supabase)

Todo Mirai en **un solo VPS** (Hostinger KVM 2 o similar, 8 GB) administrado con [Coolify](https://coolify.io):
base Postgres 17, PostgREST interno, Redis, archivos (MinIO), API, tiempo real, web, copias diarias y cron.
Archivo: [`docker-compose.yml`](docker-compose.yml). Es el mismo stack que `pnpm local:serve` (infra/local).

```
Internet ──▶ Coolify (Traefik, HTTPS automático)
              ├─ https://<dominio>         → web :8080 ──(/api/auth, /v1)──▶ api :8080
              ├─ https://rt.<dominio>      → realtime :8080 (WebSocket)
              └─ https://files.<dominio>   → minio :9000 (archivos)
red interna: db :5432 · postgrest :3000 · redis :6379 · cron · db-backup
```

## 1. Servidor

1. VPS con Ubuntu 24.04 o la plantilla "Coolify" de Hostinger. La llave pública de despliegue
   (`~/.ssh/mirai_vps.pub` del computador del dueño) va en el panel del VPS › Claves SSH.
2. Si no vino con Coolify: `curl -fsSL https://cdn.coollabs.io/coolify/install.sh | sudo bash`.
3. Firewall: solo 22 (SSH), 80 y 443. El panel de Coolify (8000) se usa por el dominio con HTTPS o por túnel SSH.
4. Entra a Coolify (`http://<IP>:8000` la primera vez) y crea el usuario administrador.

## 2. DNS (Hostinger › Dominios › engynex.com › DNS)

Registros **A** hacia la IP del VPS, para el dominio elegido (`<dominio>`):
`<dominio>`, `rt.<dominio>` y `files.<dominio>` (TTL 300). Para probar antes del corte usa un subdominio nuevo
(p. ej. `nuevo.mirai.engynex.com`); el corte final solo cambia el registro de `mirai.engynex.com`.

## 3. Variables

En el computador del dueño (no imprime valores):

```bash
node infra/coolify/variables.mjs <dominio>
```

Crea `~/.mirai/coolify-<dominio>.env` y guarda los secretos nuevos en `~/.mirai/coolify-<dominio>.secretos`
(se reutilizan: **`BETTER_AUTH_SECRET` y las contraseñas de la base nunca cambian**). `ENCRYPTION_KEY` y `CRON_SECRET`
salen de `.env.local` y deben ser las de producción. A mano en Coolify: `AI_GATEWAY_API_KEY`, `TURNSTILE_SECRET_KEY`,
`MERCADOPAGO_*` y `WOMPI_*` si se usan.

## 4. Recurso en Coolify

1. **Sources** › GitHub App › instálala solo en el repositorio de Mirai.
2. **+ New › Docker Compose** › el repositorio › rama `v6` (luego `main`) › *Docker Compose Location*
   `/infra/coolify/docker-compose.yml`.
3. **Environment Variables › Developer view**: pega el contenido de `~/.mirai/coolify-<dominio>.env` y guarda.
4. **Domains** por servicio: `web` → `https://<dominio>:8080`, `realtime` → `https://rt.<dominio>:8080`,
   `minio` → `https://files.<dominio>:9000`. Nada más lleva dominio.
5. Primer despliegue **sin datos todavía**: la base queda vacía hasta el paso 5 (la API no arranca bien sin el esquema;
   es esperado).

## 5. Esquema y datos (desde el computador del dueño, por túnel SSH)

```bash
ssh -i ~/.ssh/mirai_vps -N -L 56432:127.0.0.1:5432 root@<IP> &      # la base del VPS en localhost:56432
set -a; . ~/.mirai/coolify-<dominio>.secretos; set +a                # contraseñas en el entorno (no se imprimen)
URL="postgres://postgres:$POSTGRES_PASSWORD@localhost:56432/mirai"
```

- **Base nueva y vacía** (para probar): `node packages/db/scripts/db-destino.mjs destino --url "$URL"`.
- **Traer los datos de Supabase** (el corte): `scripts/migrate/dump-restore.sh` (preparar → volcado → cierre),
  `auth-from-supabase.ts` (usuarios con sus claves) y `storage-copy.ts` (archivos), como en el ensayo `pnpm migrate:ensayo`.

`db-destino.mjs` pone las contraseñas de `authenticator` y `mirai_app` desde `MIRAI_AUTHENTICATOR_PASSWORD` y
`MIRAI_APP_PASSWORD` (ya cargadas por el `.secretos`). Después: **Redeploy** en Coolify.

## 6. Google, pagos y avisos

- Cliente OAuth de Google: origen `https://<dominio>` y redirecciones `https://<dominio>/api/auth/callback/google` y
  `https://<dominio>/v1/google/callback`.
- Mercado Pago y Wompi: webhooks a `https://<dominio>/v1/webhooks/mercadopago` y `…/wompi`.
- El servicio `cron` llama cada hora a `/v1/jobs/notify/tick` y cada 5 min a `/v1/jobs/automations/drain` con
  `CRON_SECRET`. Al hacer el corte, apaga el `pg_cron` de Supabase (`select cron.unschedule('mirai-notify')`) y el cron
  de `vercel.json`.

## 7. Copias y operación

- `db-backup` guarda un `pg_dump` diario (3:30 a. m.) en el volumen `db-backups`, 14 días. Sácalas del servidor
  también (Coolify › S3 backups a Cloudflare R2, gratis hasta 10 GB) o con `scp`.
- Registros: Coolify › cada servicio › Logs. Reinicios: Coolify › Restart.
- Restaurar: `pg_restore -h localhost -p 56432 -U postgres -d mirai --clean <copia>.dump` por el túnel.
