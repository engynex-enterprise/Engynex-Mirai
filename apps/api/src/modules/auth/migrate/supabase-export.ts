// Migración de usuarios Supabase → auth propio (v7, §3.1.7). Parte pura: lee la exportación y arma las filas.
//
// La exportación es un JSON de SOLO LECTURA de Supabase (no la hace este script: no se conecta a Supabase). Se saca con
// SUPABASE_EXPORT_SQL desde un contenedor `postgres:17` con la cadena de solo lectura (ver §6, ítem 8):
//   docker run --rm -e PGURL postgres:17 psql "$PGURL" -At -c "<SUPABASE_EXPORT_SQL>" > auth-export.json
// y se guarda cifrada en el scratchpad o en GCS, nunca en el repositorio.
import { symmetricEncrypt } from "better-auth/crypto"
import { z } from "zod"
import { isBase32Secret, LEGACY_TOTP_PREFIX } from "../legacy-totp"
import { isBcrypt } from "../password"

/** Consulta de exportación (una fila con todo el JSON). Solo lee `auth.users`, `auth.identities` y `auth.mfa_factors`. */
export const SUPABASE_EXPORT_SQL = `select json_build_object(
  'exported_at', now(),
  'users', coalesce((select json_agg(json_build_object('id', id, 'email', email, 'encrypted_password', encrypted_password,
     'email_confirmed_at', email_confirmed_at, 'created_at', created_at, 'updated_at', updated_at, 'last_sign_in_at', last_sign_in_at,
     'raw_user_meta_data', raw_user_meta_data, 'raw_app_meta_data', raw_app_meta_data, 'banned_until', banned_until,
     'is_anonymous', is_anonymous, 'deleted_at', deleted_at)) from auth.users), '[]'),
  'identities', coalesce((select json_agg(json_build_object('id', id, 'user_id', user_id, 'provider', provider, 'provider_id', provider_id,
     'identity_data', identity_data, 'created_at', created_at, 'updated_at', updated_at, 'last_sign_in_at', last_sign_in_at)) from auth.identities), '[]'),
  'mfa_factors', coalesce((select json_agg(json_build_object('id', id, 'user_id', user_id, 'factor_type', factor_type, 'status', status,
     'secret', secret, 'friendly_name', friendly_name, 'created_at', created_at)) from auth.mfa_factors), '[]')
)`

const ts = z.string().nullable().optional()
const SbUser = z.object({
  id: z.uuid(),
  email: z.string().nullable().optional(),
  encrypted_password: z.string().nullable().optional(),
  email_confirmed_at: ts,
  created_at: ts,
  updated_at: ts,
  last_sign_in_at: ts,
  raw_user_meta_data: z.record(z.string(), z.unknown()).nullable().optional(),
  raw_app_meta_data: z.record(z.string(), z.unknown()).nullable().optional(),
  banned_until: ts,
  is_anonymous: z.boolean().nullable().optional(),
  deleted_at: ts,
})
const SbIdentity = z.object({
  id: z.string(),
  user_id: z.uuid(),
  provider: z.string(),
  provider_id: z.string(),
  identity_data: z.record(z.string(), z.unknown()).nullable().optional(),
  created_at: ts,
  updated_at: ts,
  last_sign_in_at: ts,
})
const SbFactor = z.object({ id: z.string(), user_id: z.uuid(), factor_type: z.string(), status: z.string(), secret: z.string().nullable().optional(), friendly_name: z.string().nullable().optional(), created_at: ts })
export const SupabaseExport = z.object({ exported_at: z.string().optional(), users: z.array(SbUser), identities: z.array(SbIdentity).default([]), mfa_factors: z.array(SbFactor).default([]) })
export type SupabaseExport = z.infer<typeof SupabaseExport>

export type UserRow = {
  id: string; email: string; email_verified: boolean; email_confirmed_at: string | null; name: string; image: string | null
  created_at: string; updated_at: string; last_sign_in_at: string | null; raw_user_meta_data: Record<string, unknown>; raw_app_meta_data: Record<string, unknown>
  banned: boolean; ban_expires: string | null; two_factor_enabled: boolean; mfa_reactivar: boolean
}
export type AccountRow = { id: string; user_id: string; account_id: string; provider_id: "credential" | "google"; password: string | null; email: string | null; created_at: string; updated_at: string }
export type TwoFactorRow = { id: string; user_id: string; secret: string; backup_codes: string }

export type ImportPlan = {
  users: UserRow[]
  accounts: AccountRow[]
  twoFactors: TwoFactorRow[]
  /** Conteos para la verificación (§3.1.7: mismo número de usuarios, claves, Google y factores). */
  report: {
    usuarios: number; conClave: number; google: number; totpMigrados: number; totpReactivar: number; suspendidos: number
    omitidos: { anonimos: number; sinCorreo: number; borrados: number; claveNoBcrypt: number; proveedorOtro: number }
  }
}

const now = () => new Date().toISOString()
const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null)

/** Arma las filas del auth propio. `secret` = BETTER_AUTH_SECRET (cifra los TOTP como los cifra Better Auth). */
export async function planImport(raw: unknown, secret: string, at = Date.now()): Promise<ImportPlan> {
  const data = SupabaseExport.parse(raw)
  const report: ImportPlan["report"] = { usuarios: 0, conClave: 0, google: 0, totpMigrados: 0, totpReactivar: 0, suspendidos: 0, omitidos: { anonimos: 0, sinCorreo: 0, borrados: 0, claveNoBcrypt: 0, proveedorOtro: 0 } }
  const users: UserRow[] = []
  const accounts: AccountRow[] = []
  const twoFactors: TwoFactorRow[] = []
  const kept = new Set<string>()
  const emptyCodes = await symmetricEncrypt({ key: secret, data: "[]" })

  for (const u of data.users) {
    if (u.deleted_at) { report.omitidos.borrados++; continue }
    if (u.is_anonymous) { report.omitidos.anonimos++; continue }
    const email = str(u.email)?.toLowerCase()
    if (!email) { report.omitidos.sinCorreo++; continue }
    const meta = u.raw_user_meta_data ?? {}
    const bannedUntil = u.banned_until ? new Date(u.banned_until).getTime() : 0
    const banned = bannedUntil > at
    if (banned) report.suspendidos++
    users.push({
      id: u.id,
      email,
      email_verified: !!u.email_confirmed_at,
      email_confirmed_at: u.email_confirmed_at ?? null,
      name: str(meta.nombre) ?? str(meta.full_name) ?? str(meta.name) ?? email.split("@")[0],
      image: str(meta.avatar_url) ?? str(meta.picture),
      created_at: u.created_at ?? now(),
      updated_at: u.updated_at ?? u.created_at ?? now(),
      last_sign_in_at: u.last_sign_in_at ?? null,
      raw_user_meta_data: meta,
      raw_app_meta_data: u.raw_app_meta_data ?? {},
      banned,
      ban_expires: banned ? new Date(bannedUntil).toISOString() : null,
      two_factor_enabled: false,
      mfa_reactivar: false,
    })
    kept.add(u.id)
    report.usuarios++
    const pw = str(u.encrypted_password)
    if (pw) {
      if (isBcrypt(pw)) {
        accounts.push({ id: crypto.randomUUID(), user_id: u.id, account_id: u.id, provider_id: "credential", password: pw, email, created_at: u.created_at ?? now(), updated_at: u.updated_at ?? now() })
        report.conClave++
      } else report.omitidos.claveNoBcrypt++
    }
  }

  for (const i of data.identities) {
    if (!kept.has(i.user_id)) continue
    if (i.provider === "email") continue // la forma "correo" es la fila credential (si tiene clave) o el enlace mágico
    if (i.provider !== "google") { report.omitidos.proveedorOtro++; continue }
    accounts.push({
      id: crypto.randomUUID(), user_id: i.user_id, account_id: i.provider_id, provider_id: "google", password: null,
      email: str(i.identity_data?.email)?.toLowerCase() ?? null, created_at: i.created_at ?? now(), updated_at: i.last_sign_in_at ?? i.updated_at ?? now(),
    })
    report.google++
  }

  const byId = new Map(users.map((u) => [u.id, u]))
  for (const f of data.mfa_factors) {
    const u = byId.get(f.user_id)
    if (!u || f.factor_type !== "totp" || f.status !== "verified") continue
    if (u.two_factor_enabled) continue // un factor por persona (Better Auth): el primero verificado
    if (isBase32Secret(f.secret)) {
      twoFactors.push({ id: crypto.randomUUID(), user_id: u.id, secret: await symmetricEncrypt({ key: secret, data: `${LEGACY_TOTP_PREFIX}${f.secret!.trim().toUpperCase()}` }), backup_codes: emptyCodes })
      u.two_factor_enabled = true
      u.mfa_reactivar = false
      report.totpMigrados++
    } else {
      // Secreto cifrado por GoTrue o ilegible: al entrar se le pide activarlo otra vez (aviso 7 días antes).
      u.mfa_reactivar = true
      report.totpReactivar++
    }
  }
  return { users, accounts, twoFactors, report }
}
