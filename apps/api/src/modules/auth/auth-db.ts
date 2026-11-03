// Conexión del auth propio a Postgres (Kysely sobre pg.Pool). La usa Better Auth (esquema `auth`) y los casos de uso de
// Mirai que leen auth.* (sesiones de la consola, cuenta, migración). Rol: el dueño de las tablas de `auth` (no pasa por
// la RLS de `public`); las escrituras en `public` (consentimientos) van con las mismas reglas que handle_new_user().
import { Kysely, PostgresDialect, type Generated } from "kysely"
import pg from "pg"

type Ts = Date | string
export interface UsersTable {
  id: string
  email: string | null
  email_verified: Generated<boolean>
  email_confirmed_at: Ts | null
  name: Generated<string>
  image: string | null
  created_at: Generated<Ts>
  updated_at: Generated<Ts>
  last_sign_in_at: Ts | null
  raw_user_meta_data: Generated<Record<string, unknown>>
  raw_app_meta_data: Generated<Record<string, unknown>>
  banned: Generated<boolean>
  ban_reason: string | null
  ban_expires: Ts | null
  two_factor_enabled: Generated<boolean>
  mfa_reactivar: Generated<boolean>
  is_anonymous: Generated<boolean>
}
export interface SessionsTable {
  id: string
  user_id: string
  token: string
  expires_at: Ts
  ip_address: string | null
  user_agent: string | null
  created_at: Generated<Ts>
  updated_at: Generated<Ts>
  aal: Generated<string>
  amr: string | null
}
export interface AccountsTable {
  id: string
  user_id: string
  account_id: string
  provider_id: string
  access_token: string | null
  refresh_token: string | null
  id_token: string | null
  access_token_expires_at: Ts | null
  refresh_token_expires_at: Ts | null
  scope: string | null
  password: string | null
  email: string | null
  created_at: Generated<Ts>
  updated_at: Generated<Ts>
}
export interface VerificationsTable {
  id: string
  identifier: string
  value: string
  expires_at: Ts
  created_at: Generated<Ts>
  updated_at: Generated<Ts>
}
export interface TwoFactorsTable {
  id: string
  user_id: string
  secret: string
  backup_codes: string
  verified: Generated<boolean>
  failed_verification_count: Generated<number>
  locked_until: Ts | null
  created_at: Generated<Ts>
}
/** Tablas de `auth` (se consultan con `db.withSchema("auth")`). */
export interface AuthDatabase {
  users: UsersTable
  sessions: SessionsTable
  accounts: AccountsTable
  verifications: VerificationsTable
  two_factors: TwoFactorsTable
}
export type AuthKysely = Kysely<AuthDatabase>
export const authDb = (db: AuthKysely) => db.withSchema("auth")

/**
 * Pool hacia la base del auth. `searchPath`: plan B del spike (si `schemaName` dejara de servir en Better Auth, se
 * conecta con `search_path=auth,public` y las tablas se nombran sin esquema).
 */
export function createAuthKysely(url: string, o: { max?: number; searchPath?: boolean } = {}): { db: AuthKysely; pool: pg.Pool } {
  const pool = new pg.Pool({
    connectionString: url,
    max: o.max ?? 5,
    idleTimeoutMillis: 30_000,
    application_name: "mirai-api-auth",
    ...(o.searchPath ? { options: "-c search_path=auth,public" } : {}),
  })
  return { db: new Kysely<AuthDatabase>({ dialect: new PostgresDialect({ pool }) }), pool }
}
