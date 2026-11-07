# Arnés local de Mirai v7 (Docker)

Todo corre en este computador: **nunca** toca Supabase ni la base compartida (pruebas = producción). Los valores de
aquí (contraseñas, secreto JWT, llaves anon/service) son solo de Docker local.

## Comandos (desde la raíz)

| Comando | Qué hace |
|---|---|
| `pnpm e2e:local` | **La batería E2E de Playwright contra el stack local** (escritorio 1366 px + móvil 400 px). Levanta Docker, compila API y web con variables locales, arranca API, gateway y web, y corre Playwright. |
| `pnpm e2e:local -- f1-gastos --project=escritorio` | Un archivo / un proyecto (lo que va después de `--` se le pasa a `playwright test`). |
| `pnpm e2e:local --api` | Modo api-on: la web le habla a la API local (`MIRAI_API_ROLLOUT=all`). |
| `pnpm e2e:local --auth=mirai -- f0-shell` | **v7 (V7-H4): auth propio de punta a punta, sin Supabase.** Better Auth en la API (cookie httpOnly del mismo origen, `/api/auth` y `/v1` reenviados por la web), datos por el PostgREST interno de la base **destino** (`DB_ADAPTER=postgrest`), archivos en MinIO (`OBJECT_STORE=s3`) y el gateway con la cookie. Implica `--api`. El usuario QA se crea por `/api/auth/sign-up/email` y `admin()` de las pruebas va al PostgREST destino (`tests/e2e/qa.ts`). |
| `pnpm e2e:local --no-build` | Reusa la última compilación local (`apps/web/.next-local`, `apps/api/dist`). |
| `pnpm e2e:local --build-only` | Solo compila API y web con variables locales (un `next build` con `.env.local` puede leer la base compartida al prerenderizar). |
| `pnpm e2e:local --keep` | Deja web (:55300), API (:55080) y gateway (:55081) corriendo al terminar. |
| `pnpm e2e:local --dev` | Web con `next dev` (sin compilarla): más rápido para depurar una prueba. Los errores de hidratación (#418) solo salen con la compilación. |
| `pnpm local:serve` | **Mirai completo en este computador, sin Supabase ni Vercel**: base, PostgREST, Redis, archivos (MinIO), API, tiempo real y web con el login propio. No corre pruebas; crea la cuenta `demo@mirai.local` (clave `Mirai-demo-local-2026`, solo Docker) y deja todo encendido hasta Ctrl+C. Agrega `--no-build` para reusar la última compilación o `--dev` para la web con `next dev`. |
| `pnpm local:up` / `local:down` / `local:reset` | Levanta, apaga o borra y recrea el arnés (con el "Supabase local"). |
| `pnpm local:test` | Pruebas de la API contra Docker: RLS con los 5 roles, puente PostgREST, tiempo real (`apps/api/test/pg`). |
| `pnpm migrate:ensayo` | Ensayo completo Supabase → Postgres destino entre dos Postgres locales con datos sintéticos (V7-J). |
| `pnpm db:destino <historia\|destino\|baseline\|diff\|preparar\|cierre> --url …` | Esquema de la Postgres destino (`db/postgres`). |

## Qué hay

| Servicio | Puerto | Para qué |
|---|---|---|
| `db` (Postgres 17) | 55432 | **Base destino** (como Cloud SQL): `db/postgres/0000_compat` → `0003_auth_better` (Better Auth, V7-A) → `0001_baseline` → `0001_seed` → `0002_cloud_overrides`. |
| `postgrest` | 55430 | PostgREST **interno** de la base destino (V7-D, `DB_ADAPTER=postgrest`, JWT interno de 60 s). |
| `redis` | 55379 | Adaptador de socket.io y presencia del gateway. |
| `minio` | 55900 (consola 55901) | Archivos por S3 (buckets `mirai-local-private`, `-backups`, `-public`). |
| `gcs` | 55443 | Emulador de Cloud Storage (`fake-gcs-server`) para el adaptador `gcs` de ObjectStore. |
| perfil `supa`: `supa-db` | 55434 | **"Supabase local"**: Postgres 17 + GoTrue + storage-api + las 56 migraciones + triggers `mirai_live_notify`. Base de la E2E (la web de hoy usa supabase-js) y origen de los ensayos. |
| `supa-gateway` | 55421 | Hace de Kong: `/auth/v1` (GoTrue), `/rest/v1` (PostgREST), `/storage/v1` (storage-api). |
| `supa-mail` | 55025 | Buzón de mentiras para los correos de GoTrue (enlace mágico, recuperar clave). |

La E2E usa el tiempo real del gateway de la API (`NEXT_PUBLIC_LIVE_SOURCE=gateway`, `pg_notify` → Redis), no
Supabase Realtime.

## Salvaguardas de `pnpm e2e:local`

1. Cada variable que exista en `.env.local` se pasa **vacía** a la web y a Playwright (Next y Node no pisan una
   variable ya definida), y la API corre en una carpeta sin `.env.local`. Un secreto nuevo en `.env.local` tampoco
   se cuela. Los valores de `.env.local` nunca se imprimen.
2. Antes de arrancar se revisa que todo URL del entorno apunte a `localhost`; si aparece `*.supabase.co` o el host de
   `.env.local`, se aborta.
3. Después de compilar se revisa que el JavaScript del navegador no contenga el host de Supabase real.
4. La web compila en `apps/web/.next-local` (no pisa `.next`) y corre en :55300 (nunca reutiliza un `next start` de
   :3100). Usuario QA local `qa.e2e@mirai.test` (lo crea `global-setup` con la llave local).

## Problemas comunes

- *Puerto ocupado*: quedó una corrida con `--keep`. `lsof -ti tcp:55300 | xargs kill` (y 55080, 55081).
- *Revisar una falla*: los registros de la web, la API y el gateway quedan en `infra/local/.run/logs/*.log`.
- *Empezar de cero*: `pnpm local:reset` (borra los volúmenes de Docker y vuelve a migrar).
- *Pruebas que llaman a la IA o a Google*: se saltan o fallan en local (no hay llaves); `E2E_AI` no se pasa.
