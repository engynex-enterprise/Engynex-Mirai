// v7 · V7-J · Utilidades compartidas de los scripts de migración Supabase → Postgres destino (§3.7, §5.4).
// Corren con `node --experimental-strip-types` (Node 22) y toman `pg` de packages/db (pnpm es estricto).
//
// Reglas de seguridad de TODOS los scripts:
//   - El ORIGEN puede ser Supabase solo con --permitir-supabase (ensayos C5 y el corte, con permiso del dueño). Sin esa
//     opción, solo una base de este computador (el "Supabase local" de infra/local).
//   - El DESTINO nunca es Supabase. Sin --allow-remote, solo localhost.
//   - Nunca se imprimen contraseñas ni URL completas: solo host:puerto/base.
import { createRequire } from "node:module"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), "../..")
const requireDb = createRequire(join(ROOT, "packages/db/package.json"))
export const requireApi = createRequire(join(ROOT, "apps/api/package.json"))
// eslint-disable-next-line @typescript-eslint/no-require-imports
export const pg = requireDb("pg") as typeof import("pg")
export type Client = import("pg").Client

export const args = process.argv.slice(2)
export const flag = (f: string) => args.includes(f)
export const opt = (f: string, env?: string) => {
  const i = args.indexOf(f)
  return i >= 0 ? args[i + 1] : env ? process.env[env] : undefined
}

const LOCAL_HOSTS = ["localhost", "127.0.0.1", "::1", "host.docker.internal"]
const isSupabase = (h: string) => /supabase\.(co|com)$|pooler\.supabase/i.test(h)

export function hostOf(url: string) {
  return new URL(url.replace(/^postgres(ql)?:/, "http:")).hostname
}

/** Etiqueta para el registro (sin usuario ni contraseña). */
export function label(url: string) {
  const u = new URL(url.replace(/^postgres(ql)?:/, "http:"))
  return `${u.hostname}:${u.port || 5432}${u.pathname}`
}

export function checkOrigen(url: string | undefined): string {
  if (!url) throw new Error("Falta --origen postgres://… (la base de Supabase o el Supabase local)")
  const h = hostOf(url)
  if (isSupabase(h) && !flag("--permitir-supabase")) throw new Error("El origen es Supabase: solo con --permitir-supabase (ensayo C5 o corte, con permiso del dueño).")
  if (!isSupabase(h) && !LOCAL_HOSTS.includes(h) && !flag("--allow-remote")) throw new Error(`El origen ${h} no es local: agrega --allow-remote si es a propósito.`)
  return url
}

export function checkDestino(url: string | undefined): string {
  if (!url) throw new Error("Falta --destino postgres://… (la Postgres destino)")
  const h = hostOf(url)
  if (isSupabase(h)) throw new Error("El destino no puede ser Supabase.")
  if (!LOCAL_HOSTS.includes(h) && !flag("--allow-remote")) throw new Error(`El destino ${h} no es local: agrega --allow-remote (Cloud SQL por el proxy, ensayo en la nube).`)
  return url
}

export async function connect(url: string, name: string): Promise<Client> {
  const c = new pg.Client({ connectionString: url, application_name: `mirai-migrate-${name}`, ssl: LOCAL_HOSTS.includes(hostOf(url)) ? undefined : { rejectUnauthorized: false } })
  await c.connect()
  await c.query("set timezone = 'UTC'")
  return c
}

export const log = (...a: unknown[]) => console.log(...a)
