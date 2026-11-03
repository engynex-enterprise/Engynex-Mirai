#!/usr/bin/env bash
# v7 · V7-J · Supabase → Postgres destino por secciones (docs/arquitectura/v7-gcp-total.md §3.7, D10).
#
#   scripts/migrate/dump-restore.sh --origen <url> --destino <url> [--permitir-supabase] [--allow-remote]
#                                   [--ref-admin <url>] [--work <carpeta>]
#
# Orden (el de §3.7; ningún trigger ni llave foránea existe mientras se cargan los datos):
#   1. destino: 0000_compat + 0003_auth_better                          (db-destino.mjs preparar)
#   2. referencia: una base temporal con compat + auth + línea base + overrides en el servidor de --ref-admin
#      (por defecto el Postgres de Docker local) → pg_dump -Fc --schema-only de public
#   3. destino: pg_restore --section=pre-data de la referencia          (tablas, tipos y funciones; sin índices ni FK)
#   4. personas: auth-from-supabase.ts                                  (mismos UUID y hashes bcrypt)
#   5. origen: pg_dump -Fc --data-only de public → destino: pg_restore --section=data (una transacción)
#   6. destino: pg_restore --section=post-data de la referencia         (índices, FK, triggers, políticas, permisos)
#   7. destino: 0002_cloud_overrides + historia registrada + authenticator + analyze   (db-destino.mjs cierre)
#   8. verify.ts origen vs destino                                      (0 diferencias o falla)
# Las herramientas de Postgres corren en contenedores postgres:17-alpine (este computador no tiene pg_dump).
# Nunca imprime URL completas ni contraseñas. El origen de Supabase solo con --permitir-supabase (permiso del dueño).
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
ORIGEN="" DESTINO="" REF_ADMIN="postgres://postgres:mirai-local@localhost:55432/postgres" WORK="" EXTRA=()
while [[ $# -gt 0 ]]; do
  case "$1" in
    --origen) ORIGEN="$2"; shift 2 ;;
    --destino) DESTINO="$2"; shift 2 ;;
    --ref-admin) REF_ADMIN="$2"; shift 2 ;;
    --work) WORK="$2"; shift 2 ;;
    --permitir-supabase|--allow-remote) EXTRA+=("$1"); shift ;;
    *) echo "Opción desconocida: $1" >&2; exit 1 ;;
  esac
done
[[ -n "$ORIGEN" && -n "$DESTINO" ]] || { echo "Uso: dump-restore.sh --origen <url> --destino <url>" >&2; exit 1; }
KEEP_WORK=1
if [[ -z "$WORK" ]]; then WORK="$(mktemp -d "${TMPDIR:-/tmp}/mirai-migrate.XXXXXX")"; KEEP_WORK=0; fi
chmod 700 "$WORK"
# Los volcados llevan datos de personas: se borran al terminar (salvo que se haya pedido --work <carpeta>).
cleanup() { [[ "$KEEP_WORK" == 1 ]] || rm -rf "$WORK"; }
trap cleanup EXIT
TS="node --experimental-strip-types --no-warnings"
DB="node $ROOT/packages/db/scripts/db-destino.mjs"
REMOTE=""; for e in "${EXTRA[@]:-}"; do [[ "$e" == "--allow-remote" ]] && REMOTE="--allow-remote"; done

# Revisa origen y destino con las mismas reglas de lib.ts antes de tocar nada.
$TS -e "import('$ROOT/scripts/migrate/lib.ts').then(m => { m.checkOrigen(process.argv[1]); m.checkDestino(process.argv[2]); console.log('Origen ' + m.label(process.argv[1]) + ' → destino ' + m.label(process.argv[2])) })" "$ORIGEN" "$DESTINO" ${EXTRA[@]+"${EXTRA[@]}"}

# pg_dump / pg_restore en un contenedor. localhost → host.docker.internal; la contraseña va por PGPASSWORD (no en ps).
pgtool() {
  local url="$1"; shift
  local parts; parts=$(node -e '
    const u = new URL(process.argv[1].replace(/^postgres(ql)?:/, "http:"));
    const h = ["localhost","127.0.0.1","::1"].includes(u.hostname) ? "host.docker.internal" : u.hostname;
    console.log([h, u.port || 5432, decodeURIComponent(u.username), u.pathname.slice(1)].join("\t"));' "$url")
  local host port user db; IFS=$'\t' read -r host port user db <<<"$parts"
  PGPASSWORD=$(node -e 'console.log(decodeURIComponent(new URL(process.argv[1].replace(/^postgres(ql)?:/, "http:")).password))' "$url") \
    docker run --rm -i -e PGPASSWORD -e PGHOST="$host" -e PGPORT="$port" -e PGUSER="$user" -e PGDATABASE="$db" \
      -v "$WORK:/work" postgres:17-alpine "$@"
}

step() { printf '\n▶ %s\n' "$*"; }
T0=$(date +%s)

step "1/8 destino: compatibilidad + auth"
$DB preparar --url "$DESTINO" $REMOTE

step "2/8 referencia del esquema (base temporal mirai_v7_ref)"
REF=$(node -e 'const u=new URL(process.argv[1]); u.pathname="/mirai_v7_ref"; console.log(u.toString())' "$REF_ADMIN")
node -e '
  const { createRequire } = require("node:module"); const pg = createRequire(process.argv[2] + "/packages/db/package.json")("pg");
  const c = new pg.Client({ connectionString: process.argv[1] });
  c.connect().then(() => c.query("drop database if exists mirai_v7_ref with (force)")).then(() => c.query("create database mirai_v7_ref")).then(() => c.end());' "$REF_ADMIN" "$ROOT"
$DB destino --url "$REF" --no-seed > "$WORK/ref.log"
pgtool "$REF" pg_dump -Fc --schema-only --schema=public --exclude-table=public._mirai_migrations --no-owner -f /work/ref.dump
node -e '
  const { createRequire } = require("node:module"); const pg = createRequire(process.argv[2] + "/packages/db/package.json")("pg");
  const c = new pg.Client({ connectionString: process.argv[1] });
  c.connect().then(() => c.query("drop database if exists mirai_v7_ref with (force)")).then(() => c.end());' "$REF_ADMIN" "$ROOT"

step "3/8 destino: pre-data (tablas y funciones)"
# El esquema public ya existe en cualquier Postgres: fuera de la lista (si no, CREATE SCHEMA public falla).
pgtool "$DESTINO" pg_restore -l /work/ref.dump | grep -v " SCHEMA - public " > "$WORK/ref.list"
pgtool "$DESTINO" pg_restore --section=pre-data --no-owner --exit-on-error -L /work/ref.list -d "$(node -e 'console.log(new URL(process.argv[1]).pathname.slice(1))' "$DESTINO")" /work/ref.dump

step "4/8 personas (GoTrue → Better Auth)"
$TS "$ROOT/scripts/migrate/auth-from-supabase.ts" --origen "$ORIGEN" --destino "$DESTINO" ${EXTRA[@]+"${EXTRA[@]}"}

step "5/8 datos de public (origen → destino, una transacción)"
pgtool "$ORIGEN" pg_dump -Fc --data-only --schema=public --exclude-table=public._mirai_migrations -f /work/data.dump
pgtool "$DESTINO" pg_restore --section=data --data-only --no-owner --single-transaction --exit-on-error -d "$(node -e 'console.log(new URL(process.argv[1]).pathname.slice(1))' "$DESTINO")" /work/data.dump

step "6/8 destino: post-data (índices, llaves, triggers, políticas, permisos)"
pgtool "$DESTINO" pg_restore --section=post-data --no-owner --exit-on-error -L /work/ref.list -d "$(node -e 'console.log(new URL(process.argv[1]).pathname.slice(1))' "$DESTINO")" /work/ref.dump

step "7/8 destino: overrides, historia, authenticator"
$DB cierre --url "$DESTINO" $REMOTE

step "8/8 verificación"
$TS "$ROOT/scripts/migrate/verify.ts" --origen "$ORIGEN" --destino "$DESTINO" ${EXTRA[@]+"${EXTRA[@]}"}
printf '\n✓ Migración por secciones en %ss\n' "$(( $(date +%s) - T0 ))"
