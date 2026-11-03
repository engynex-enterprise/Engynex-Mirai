// v7 · V7-J · Personas de Supabase Auth (GoTrue) → tablas de Better Auth en la Postgres destino (§3.1.7).
//
//   node --experimental-strip-types scripts/migrate/auth-from-supabase.ts --origen <url> --destino <url> [--dry-run]
//        [--permitir-supabase] [--allow-remote]      (BETTER_AUTH_SECRET en el entorno: cifra los TOTP)
//
// - Mismo UUID (las 44 FK de public siguen sirviendo), mismo correo, metadatos y fechas.
// - La contraseña viaja con su MISMO hash bcrypt ($2a$/$2b$) a auth.accounts(provider_id='credential'): nadie la cambia.
// - Google: auth.accounts(provider_id='google', account_id = sub de Google).
// - TOTP verificado con el secreto en claro (base32) → auth.two_factors cifrado como lo cifra Better Auth. Si el
//   secreto viene cifrado por GoTrue, two_factor_enabled = false y mfa_reactivar = true (lo pide al entrar).
// - Suspendidos (banned_until > ahora) siguen suspendidos. Anónimos y cuentas sin correo SÍ se llevan (is_anonymous,
//   sin formas de entrar) porque sus filas de public (perfil, hogar) apuntan a auth.users; el reporte las cuenta.
// - Sesiones y refresh tokens no se llevan (todos entran una vez después del corte).
// Idempotente (on conflict … do update): se puede correr otra vez dentro de la ventana.
import { randomUUID } from "node:crypto"
import { checkDestino, checkOrigen, connect, flag, label, log, opt, requireApi, type Client } from "./lib.ts"

type SupaUser = {
  id: string
  email: string | null
  encrypted_password: string | null
  email_confirmed_at: Date | null
  created_at: Date | null
  updated_at: Date | null
  last_sign_in_at: Date | null
  raw_user_meta_data: Record<string, unknown> | null
  raw_app_meta_data: Record<string, unknown> | null
  banned_until: Date | null
  is_anonymous: boolean | null
}

export type AuthReport = { users: number; credential: number; google: number; totp: number; mfaReactivar: number; flagged: { anonymous: number; noEmail: number }; banned: number }

const BCRYPT = /^\$2[aby]\$\d{2}\$[./A-Za-z0-9]{53}$/
const BASE32 = /^[A-Z2-7]+=*$/

async function encryptor(): Promise<(s: string) => Promise<string>> {
  const secret = process.env.BETTER_AUTH_SECRET
  if (!secret) return async () => {
    throw new Error("Falta BETTER_AUTH_SECRET para cifrar los TOTP")
  }
  // El mismo cifrado que usa el plugin twoFactor de Better Auth (symmetricEncrypt con BETTER_AUTH_SECRET).
  const { symmetricEncrypt } = (await import(requireApi.resolve("better-auth/crypto"))) as { symmetricEncrypt: (o: { key: string; data: string }) => Promise<string> }
  return (data: string) => symmetricEncrypt({ key: secret, data })
}

export async function migrateAuth(src: Client, dst: Client, o: { dryRun?: boolean } = {}): Promise<AuthReport> {
  const rep: AuthReport = { users: 0, credential: 0, google: 0, totp: 0, mfaReactivar: 0, flagged: { anonymous: 0, noEmail: 0 }, banned: 0 }
  const users = (await src.query<SupaUser>(
    "select id, email, encrypted_password, email_confirmed_at, created_at, updated_at, last_sign_in_at, raw_user_meta_data, raw_app_meta_data, banned_until, coalesce(is_anonymous, false) as is_anonymous from auth.users order by created_at, id",
  )).rows
  const identities = (await src.query<{ user_id: string; provider_id: string; created_at: Date | null }>("select user_id, provider_id, created_at from auth.identities where provider = 'google'")).rows
  const factors = (await src.query<{ user_id: string; secret: string | null; created_at: Date }>(
    "select user_id, secret, created_at from auth.mfa_factors where factor_type = 'totp' and status = 'verified' order by created_at",
  )).rows
  const encrypt = await encryptor()
  const totpBy = new Map<string, string | null>()
  for (const f of factors) if (!totpBy.has(f.user_id)) totpBy.set(f.user_id, f.secret)

  await dst.query("begin")
  try {
    // El alta de Better Auth no debe disparar handle_new_user aquí (perfil y datos llegan con el volcado de public).
    await dst.query("set local session_replication_role = replica").catch(() => log("! sin permiso para session_replication_role: los triggers de auth.users corren (on conflict los vuelve inocuos)"))
    for (const u of users) {
      if (u.is_anonymous) rep.flagged.anonymous++
      if (!u.email) rep.flagged.noEmail++
      const meta = u.raw_user_meta_data ?? {}
      const name = String(meta.nombre ?? meta.full_name ?? meta.name ?? u.email?.split("@")[0] ?? "")
      const image = (meta.avatar_url ?? meta.picture ?? null) as string | null
      const banned = !!u.banned_until && u.banned_until.getTime() > Date.now()
      if (banned) rep.banned++
      const secret = totpBy.get(u.id)
      const totpOk = typeof secret === "string" && BASE32.test(secret.replace(/\s/g, "").toUpperCase())
      const reactivar = totpBy.has(u.id) && !totpOk
      if (reactivar) rep.mfaReactivar++
      await dst.query(
        `insert into auth.users (id, email, email_verified, email_confirmed_at, name, image, created_at, updated_at, last_sign_in_at,
           raw_user_meta_data, raw_app_meta_data, banned, ban_expires, two_factor_enabled, mfa_reactivar, is_anonymous)
         values ($1, lower($2), $3, $4, $5, $6, coalesce($7, now()), coalesce($8, now()), $9, $10, $11, $12, $13, $14, $15, $16)
         on conflict (id) do update set email = excluded.email, email_verified = excluded.email_verified, email_confirmed_at = excluded.email_confirmed_at,
           name = excluded.name, image = excluded.image, updated_at = excluded.updated_at, last_sign_in_at = excluded.last_sign_in_at,
           raw_user_meta_data = excluded.raw_user_meta_data, raw_app_meta_data = excluded.raw_app_meta_data, banned = excluded.banned,
           ban_expires = excluded.ban_expires, two_factor_enabled = excluded.two_factor_enabled, mfa_reactivar = excluded.mfa_reactivar, is_anonymous = excluded.is_anonymous`,
        [u.id, u.email, !!u.email_confirmed_at, u.email_confirmed_at, name, image, u.created_at, u.updated_at, u.last_sign_in_at, meta, u.raw_app_meta_data ?? {}, banned, banned ? u.banned_until : null, totpOk, reactivar, !!u.is_anonymous],
      )
      rep.users++
      if (!u.is_anonymous && u.email && u.encrypted_password && BCRYPT.test(u.encrypted_password)) {
        await dst.query(
          `insert into auth.accounts (id, user_id, account_id, provider_id, password, created_at, updated_at) values ($1, $2, $5, 'credential', $3, coalesce($4, now()), now())
           on conflict (provider_id, account_id) do update set password = excluded.password, updated_at = now()`,
          [randomUUID(), u.id, u.encrypted_password, u.created_at, u.id],
        )
        rep.credential++
      }
      if (totpOk) {
        const codes = await encrypt(JSON.stringify([]))
        await dst.query(
          `insert into auth.two_factors (id, user_id, secret, backup_codes, verified) values ($1, $2, $3, $4, true)
           on conflict (user_id) do update set secret = excluded.secret`,
          [randomUUID(), u.id, await encrypt(secret!.replace(/\s/g, "").toUpperCase()), codes],
        )
        rep.totp++
      }
    }
    const migrated = new Set(users.filter((u) => !u.is_anonymous).map((u) => u.id))
    for (const i of identities) {
      if (!migrated.has(i.user_id)) continue
      await dst.query(
        `insert into auth.accounts (id, user_id, account_id, provider_id, created_at, updated_at) values ($1, $2, $3, 'google', coalesce($4, now()), now())
         on conflict (provider_id, account_id) do update set user_id = excluded.user_id, updated_at = now()`,
        [randomUUID(), i.user_id, i.provider_id, i.created_at],
      )
      rep.google++
    }
    await dst.query(o.dryRun ? "rollback" : "commit")
  } catch (e) {
    await dst.query("rollback").catch(() => {})
    throw e
  }
  return rep
}

async function main() {
  const origen = checkOrigen(opt("--origen", "MIGRATE_ORIGEN_URL"))
  const destino = checkDestino(opt("--destino", "MIGRATE_DESTINO_URL"))
  log(`Personas: ${label(origen)} → ${label(destino)}${flag("--dry-run") ? " (simulación)" : ""}`)
  const [src, dst] = [await connect(origen, "auth-src"), await connect(destino, "auth-dst")]
  try {
    const r = await migrateAuth(src, dst, { dryRun: flag("--dry-run") })
    log(JSON.stringify(r))
  } finally {
    await src.end()
    await dst.end()
  }
}

if (process.argv[1]?.endsWith("auth-from-supabase.ts")) await main()
