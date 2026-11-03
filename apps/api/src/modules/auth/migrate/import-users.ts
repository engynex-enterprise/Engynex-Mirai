// Escribe el plan de importación en la Postgres destino (esquema `auth`), en UNA transacción e idempotente
// (on conflict): se puede correr otra vez dentro de la ventana del corte para traer las cuentas nuevas.
// Por defecto apaga los triggers de usuario de auth.users mientras importa (handle_new_user no debe volver a crear
// perfiles ni consentimientos: esos datos llegan con la restauración de `public`). Requiere ser dueño de auth.users.
import { sql } from "kysely"
import { authDb, type AuthKysely } from "../auth-db"
import type { ImportPlan } from "./supabase-export"

export type ImportResult = { users: number; accounts: number; twoFactors: number }

export async function importUsers(db: AuthKysely, plan: ImportPlan, o: { triggers?: boolean } = {}): Promise<ImportResult> {
  return db.transaction().execute(async (tx) => {
    if (!o.triggers) await sql`alter table auth.users disable trigger user`.execute(tx)
    const t = authDb(tx)
    for (const u of plan.users) {
      await t
        .insertInto("users")
        .values(u)
        .onConflict((c) =>
          c.column("id").doUpdateSet({
            email: u.email, email_verified: u.email_verified, email_confirmed_at: u.email_confirmed_at, name: u.name, image: u.image, updated_at: u.updated_at,
            last_sign_in_at: u.last_sign_in_at, raw_user_meta_data: u.raw_user_meta_data, raw_app_meta_data: u.raw_app_meta_data, banned: u.banned, ban_expires: u.ban_expires,
            two_factor_enabled: u.two_factor_enabled, mfa_reactivar: u.mfa_reactivar,
          }),
        )
        .execute()
    }
    for (const a of plan.accounts) {
      await t
        .insertInto("accounts")
        .values(a)
        .onConflict((c) => c.columns(["provider_id", "account_id"]).doUpdateSet({ user_id: a.user_id, password: a.password, email: a.email, updated_at: a.updated_at }))
        .execute()
    }
    for (const f of plan.twoFactors) {
      await t
        .insertInto("two_factors")
        .values({ ...f, verified: true })
        .onConflict((c) => c.column("user_id").doUpdateSet({ secret: f.secret, backup_codes: f.backup_codes, verified: true }))
        .execute()
    }
    if (!o.triggers) await sql`alter table auth.users enable trigger user`.execute(tx)
    return { users: plan.users.length, accounts: plan.accounts.length, twoFactors: plan.twoFactors.length }
  })
}

/** Conteos en la base destino (verificación: deben coincidir con el reporte del plan). */
export async function countAuth(db: AuthKysely) {
  const r = await sql<{ usuarios: number; con_clave: number; google: number; totp: number; reactivar: number }>`
    select (select count(*)::int from auth.users) usuarios,
           (select count(*)::int from auth.accounts where provider_id = 'credential' and password is not null) con_clave,
           (select count(*)::int from auth.accounts where provider_id = 'google') google,
           (select count(*)::int from auth.two_factors) totp,
           (select count(*)::int from auth.users where mfa_reactivar) reactivar`.execute(db)
  return r.rows[0]
}
