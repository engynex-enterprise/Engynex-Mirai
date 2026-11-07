# Mirai en un servidor propio con Dokploy o Coolify (sin Vercel ni Supabase)

Todo Mirai en **un solo VPS** (Hostinger KVM 1 o 2, plantilla "Ubuntu 24.04 with Dokploy") administrado con
[Dokploy](https://dokploy.com) (o [Coolify](https://coolify.io): el mismo `docker-compose.yml` sirve para los dos):
base Postgres 17, PostgREST interno, Redis, archivos (SeaweedFS, compatible con S3), API, tiempo real, web, copias diarias y cron.
Es el mismo stack que `pnpm local:serve` (infra/local) y se prueba igual en este computador con
`node infra/servidor/prueba-local.mjs` (MIRAI_ENV=produccion, mismas imágenes).

```
Internet ──▶ Traefik del panel (HTTPS automático con Let's Encrypt)
              ├─ https://<dominio>         → web :8080 ──(/api/auth, /v1)──▶ api :8080
              ├─ https://<dominio>/socket.io → realtime :8080 (WebSocket, mismo dominio)
              └─ https://files.<dominio>   → minio :9000 (archivos, SeaweedFS)
red interna: db :5432 · postgrest :3000 · redis :6379 · cron · db-backup
```

## 1. Servidor (Hostinger)

1. VPS con la plantilla **Ubuntu 24.04 with Dokploy**, centro de datos **Boston**, y la llave pública de despliegue
   (`~/.ssh/mirai_vps.pub` del computador del dueño). La IP se lee con la API de Hostinger (`HOSTINGER_API_TOKEN`).
2. Firewall del VPS (Hostinger › VPS › Firewall, o la API): entrada solo 22, 80, 443 y 3000 (panel de Dokploy, hasta
   ponerle dominio; luego se cierra).
3. Panel: `http://<IP>:3000` → crea el usuario administrador (correo y contraseña del dueño; no se comparten).

## 2. DNS (zona engynex.com en Hostinger; se puede por la API)

Registros **A** hacia la IP del VPS, TTL 300: `<dominio>`, `files.<dominio>` (y `panel.<dominio>` para
el panel con HTTPS). Para probar antes del corte: un subdominio nuevo (p. ej. `nuevo.mirai.engynex.com`); el corte
final solo cambia el registro de `mirai.engynex.com`.

## 3. Variables (en el computador del dueño; no imprime valores)

```bash
node infra/servidor/variables.mjs <dominio>
```

Crea `~/.mirai/servidor-<dominio>.env`; los secretos nuevos quedan en `~/.mirai/servidor-<dominio>.secretos` y se
reutilizan (**`BETTER_AUTH_SECRET` y las contraseñas de la base nunca cambian**). `ENCRYPTION_KEY` y `CRON_SECRET` salen
de `.env.local` y deben ser las de producción. A mano en el panel: `AI_GATEWAY_API_KEY`, `TURNSTILE_SECRET_KEY`,
`MERCADOPAGO_*` y `WOMPI_*` si se usan.

## 4a. Dokploy

1. **Settings › Git › GitHub**: conecta la cuenta y da acceso solo al repositorio de Mirai.
2. **Projects › + Create Project** "Mirai" › **+ Create Service › Compose** (tipo *Docker Compose*, no *Stack*: el modo
   Stack no compila imágenes).
3. **General › Provider: GitHub** › repositorio › rama `v6` (luego `main`) › **Compose Path**
   `./infra/servidor/docker-compose.yml`.
4. **Advanced › Isolated Deployments: activado** (si no, al ponerle dominio a un servicio Dokploy lo saca de la red
   interna y la web deja de ver a la API).
5. **Environment**: pega el contenido de `~/.mirai/servidor-<dominio>.env` y guarda (Dokploy lo escribe como `.env` al
   lado del compose; el compose lo usa con `${VAR}`).
6. **Domains** (+ Add Domain, HTTPS con Let's Encrypt): servicio `web` → `<dominio>` puerto 8080; `realtime` →
   `<dominio>` con ruta `/socket.io` puerto 8080; `minio` → `files.<dominio>` puerto 9000.
7. **Deploy**. La primera vez la base queda vacía hasta el paso 5 (es esperado que la API no quede sana todavía).

## 4b. Coolify (alternativa)

**+ New › Docker Compose** › repositorio › *Docker Compose Location* `/infra/servidor/docker-compose.yml` ›
Environment Variables › *Developer view* (pega el `.env`) › Domains por servicio como arriba (`https://<dominio>:8080`,
`https://rt.<dominio>:8080`, `https://files.<dominio>:9000`) › Deploy.

## 5. Esquema y datos (desde el computador del dueño, por túnel SSH)

```bash
ssh -i ~/.ssh/mirai_vps -N -L 56432:127.0.0.1:5432 root@<IP> &      # la base del VPS en localhost:56432
set -a; . ~/.mirai/servidor-<dominio>.secretos; set +a               # contraseñas en el entorno (no se imprimen)
URL="postgres://postgres:$POSTGRES_PASSWORD@localhost:56432/mirai"
```

- **Base nueva y vacía** (para probar): `node packages/db/scripts/db-destino.mjs destino --url "$URL"`.
- **Traer los datos de Supabase** (ensayo y corte): `scripts/migrate/dump-restore.sh` (preparar → volcado → cierre),
  `auth-from-supabase.ts` (usuarios con sus claves) y `storage-copy.ts` (archivos), como en `pnpm migrate:ensayo`.

`db-destino.mjs` pone las contraseñas de `authenticator` y `mirai_app` desde `MIRAI_AUTHENTICATOR_PASSWORD` y
`MIRAI_APP_PASSWORD` (ya cargadas por el `.secretos`). Después: **Redeploy**.

## 6. Google, pagos y avisos

- Cliente OAuth de Google: origen `https://<dominio>` y redirecciones `https://<dominio>/api/auth/callback/google` y
  `https://<dominio>/v1/google/callback`.
- Mercado Pago y Wompi: webhooks a `https://<dominio>/v1/webhooks/mercadopago` y `…/wompi`.
- El servicio `cron` llama cada hora a `/v1/jobs/notify/tick` y cada 5 min a `/v1/jobs/automations/drain` con
  `CRON_SECRET`. En el corte: apaga el `pg_cron` de Supabase (`select cron.unschedule('mirai-notify')`) y el cron de
  `vercel.json`.

## 7. Copias y operación

- `db-backup` guarda un `pg_dump` diario (3:30 a. m.) en el volumen `db-backups`, 14 días. Sácalas también del servidor
  (Dokploy › Backups a S3/Cloudflare R2, gratis hasta 10 GB, o `scp`).
- Registros y reinicios: en el panel, cada servicio › Logs / Restart.
- Restaurar: `pg_restore -h localhost -p 56432 -U postgres -d mirai --clean <copia>.dump` por el túnel.
- Servidor de 4 GB (KVM 1): si compilar la web en el VPS se queda sin memoria, se compilan las imágenes en GitHub
  Actions y el compose las descarga (o se agrega swap de 4 GB).
