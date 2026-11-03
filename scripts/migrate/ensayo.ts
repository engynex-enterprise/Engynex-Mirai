// v7 · V7-J · Ensayo completo de la migración en Docker, entre DOS Postgres locales, con datos sintéticos.
//
//   pnpm migrate:ensayo        (= node --experimental-strip-types scripts/migrate/ensayo.ts; levanta infra/local)
//
//   origen  = "Supabase local" (Postgres 17 en :55434, base mirai_ensayo_origen): compat + shim de GoTrue + las 56
//             migraciones, con personas sintéticas (bcrypt real de pgcrypto, Google, TOTP en claro y cifrado,
//             suspendida, anónima), dos hogares con datos, URL públicas de Supabase y archivos en storage-api local.
//   destino = Postgres 17 en :55432, base mirai_ensayo_destino (vacía).
// Pasos: dump-restore.sh (incluye verify = 0 diferencias) → hashes bcrypt y TOTP descifrables → reescritura de URL
// → vuelta atrás (persona y cambios nuevos del destino vuelven al origen) → copia de archivos a MinIO (dos pasadas).
// Nada sale de este computador. Falla (código ≠ 0) si algo no cuadra.
import { spawnSync } from "node:child_process"
import { randomUUID } from "node:crypto"
import { join } from "node:path"
import { LOCAL, localKeys, up } from "../../infra/local/stack.mjs"
import { connect, log, pg, requireApi, ROOT } from "./lib.ts"
import { rewritePublicUrls } from "./rewrite-public-urls.ts"
import { rollbackDelta } from "./rollback-delta.ts"
import { storageCopy } from "./storage-copy.ts"
import { verify } from "./verify.ts"

const ORIGEN = LOCAL.supaDbUrl.replace(/\/mirai$/, "/mirai_ensayo_origen")
const DESTINO = LOCAL.dbUrl.replace(/\/mirai$/, "/mirai_ensayo_destino")
const FAKE_PREFIX = "https://abcdefghijklmnopqrst.supabase.co/storage/v1/object/public/"
const NEW_PREFIX = `${LOCAL.s3.endpoint}/mirai-local-public/`
// Solo para este ensayo local: cifra los TOTP como lo hará Better Auth con el secreto real.
process.env.BETTER_AUTH_SECRET ??= "secreto-local-del-ensayo-de-migracion-v7-0001"
const TOTP = "JBSWY3DPEHPK3PXP"
const fails: string[] = []
const check = (ok: boolean, msg: string) => {
  log(`${ok ? "✓" : "✗"} ${msg}`)
  if (!ok) fails.push(msg)
}

async function recreate(adminUrl: string, db: string) {
  const c = new pg.Client({ connectionString: adminUrl })
  await c.connect()
  await c.query(`drop database if exists ${db} with (force)`)
  await c.query(`create database ${db}`)
  await c.end()
}

const run = (cmd: string, args: string[]) => {
  const r = spawnSync(cmd, args, { stdio: "inherit", cwd: ROOT, env: process.env })
  if (r.status !== 0) throw new Error(`${cmd} ${args[0]} salió con ${r.status}`)
}

/** Personas y datos sintéticos en el origen (como los tendría Supabase). */
async function sembrar() {
  const c = await connect(ORIGEN, "ensayo-seed")
  const u = { ana: randomUUID(), beto: randomUUID(), caro: randomUUID(), dani: randomUUID(), eva: randomUUID(), anon: randomUUID() }
  const user = async (id: string, email: string | null, pwd: string | null, meta: object, extra = "") =>
    c.query(
      `insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_user_meta_data, raw_app_meta_data, created_at, updated_at, last_sign_in_at${extra ? ", " + extra.split("=")[0] : ""})
       values ('00000000-0000-0000-0000-000000000000', $1, 'authenticated', 'authenticated', $2, case when $3::text is null then null else extensions.crypt($3, extensions.gen_salt('bf', 10)) end,
               now() - interval '30 days', $4, '{"provider":"email","providers":["email"]}', now() - interval '30 days', now() - interval '1 day', now() - interval '1 day'${extra ? ", " + extra.split("=")[1] : ""})`,
      [id, email, pwd, meta],
    )
  await user(u.ana, "ana@ensayo.mirai.test", "Clave-ana-1", { nombre: "Ana", acepta_version: "2026-10", avatar_url: `${FAKE_PREFIX}avatars/${randomUUID()}/foto.webp` })
  await user(u.beto, "beto@ensayo.mirai.test", "Clave-beto-2", { nombre: "Beto" })
  await user(u.caro, "caro@ensayo.mirai.test", null, { full_name: "Carolina Google", picture: "https://lh3.googleusercontent.com/a/x" })
  await user(u.dani, "dani@ensayo.mirai.test", "Clave-dani-3", { nombre: "Dani" }, "banned_until=now() + interval '10 days'")
  await user(u.eva, "eva@ensayo.mirai.test", "Clave-eva-4", { nombre: "Eva" })
  await user(u.anon, null, null, { nombre: "Invitado" }, "is_anonymous=true")
  for (const [id, sub] of [[u.beto, "google-sub-beto"], [u.caro, "google-sub-caro"]]) {
    await c.query("insert into auth.identities (provider_id, user_id, identity_data, provider, created_at, updated_at) values ($1, $2, $3, 'google', now(), now())", [sub, id, { sub, email: "x@gmail.com" }])
  }
  await c.query("insert into auth.mfa_factors (id, user_id, factor_type, status, secret) values ($1, $2, 'totp', 'verified', $3), ($4, $5, 'totp', 'verified', $6), ($7, $2, 'totp', 'unverified', 'XXXX')", [
    randomUUID(), u.ana, TOTP, randomUUID(), u.eva, JSON.stringify({ key_id: "k1", alg: "aes-gcm-hkdf", data: "cifrado" }), randomUUID(),
  ])
  const as = async (id: string, sql: string, params: unknown[] = []) => {
    await c.query("begin")
    await c.query("set local role authenticated")
    await c.query("select set_config('request.jwt.claims', $1, true), set_config('request.headers', '{\"x-mirai-enlaces\":\"1\"}', true)", [JSON.stringify({ sub: id, role: "authenticated" })])
    const r = await c.query(sql, params)
    await c.query("commit")
    return r.rows
  }
  const bookAna = (await as(u.ana, "select public.create_household('Familia Ensayo', 'Casa') as b"))[0].b
  const bookBeto = (await as(u.beto, "select public.create_household('Hogar de Beto', 'Personal') as b"))[0].b
  for (const [id, b] of [[u.ana, bookAna], [u.beto, bookBeto]]) {
    await as(id, "insert into public.expenses (book_id, fecha, descripcion, valor, created_by) select $1, current_date - g, 'Gasto ' || g, 1000 * g, $2 from generate_series(1, 40) g", [b, id])
    await as(id, "insert into public.incomes (book_id, concepto, valor, created_by) values ($1, 'Salario', 2600000, $2)", [b, id])
    const f = (await as(id, "insert into public.fixed_expenses (book_id, nombre, valor, dia) values ($1, 'Arriendo', 1200000, 5) returning id", [b]))[0].id
    await as(id, "select public.pay_fixed_expense($1, '2026-10', '2026-10-05', 1200000, null, '')", [f])
    await as(id, "insert into public.goals (book_id, nombre, objetivo) values ($1, 'Viaje', 3000000)", [b])
  }
  await c.query("insert into public.family_members (household_id, nombre, avatar) select household_id, 'Hijo', $2 from public.books where id = $1", [bookAna, `${FAKE_PREFIX}avatars/hijo.webp`])
  await c.query("insert into public.notifications (user_id, book_id, kind, titulo, cuerpo) values ($1, $2, 'sistema', 'Hola', 'Bienvenida')", [u.ana, bookAna])
  await c.end()
  return { u, bookAna }
}

async function main() {
  await up({ supa: true })
  log("\n▶ Origen y destino nuevos")
  await recreate(LOCAL.supaDbUrl.replace(/\/mirai$/, "/postgres"), "mirai_ensayo_origen")
  await recreate(LOCAL.dbAdminUrl, "mirai_ensayo_destino")
  run("node", [join(ROOT, "packages/db/scripts/db-destino.mjs"), "historia", "--url", ORIGEN])
  const { u, bookAna } = await sembrar()

  log("\n▶ dump-restore.sh (incluye verify)")
  const t0 = Date.now()
  run("bash", [join(ROOT, "scripts/migrate/dump-restore.sh"), "--origen", ORIGEN, "--destino", DESTINO])
  check(true, `volcado por secciones + verificación en ${Math.round((Date.now() - t0) / 1000)} s`)

  const [src, dst] = [await connect(ORIGEN, "ensayo-src"), await connect(DESTINO, "ensayo-dst")]
  try {
    const v = await verify(src, dst)
    check(v.diffs.length === 0, `verify: ${v.tables} tablas, ${v.rows} filas, ${v.diffs.length} diferencias`)

    const bcrypt = requireApi("bcryptjs") as { compare(a: string, b: string): Promise<boolean> }
    const hash = (await dst.query("select password from auth.accounts where user_id = $1 and provider_id = 'credential'", [u.ana])).rows[0]?.password
    check(!!hash && (await bcrypt.compare("Clave-ana-1", hash)), "la clave de Ana sirve con el hash bcrypt importado (nadie cambia su clave)")
    const google = (await dst.query("select user_id from auth.accounts where provider_id = 'google' and account_id = 'google-sub-caro'")).rows[0]?.user_id
    check(google === u.caro, "entrar con Google cae en la misma cuenta (sub de Google → mismo UUID)")
    const { symmetricDecrypt } = (await import(requireApi.resolve("better-auth/crypto"))) as { symmetricDecrypt: (o: { key: string; data: string }) => Promise<string> }
    const tf = (await dst.query("select secret from auth.two_factors where user_id = $1", [u.ana])).rows[0]?.secret
    check(!!tf && (await symmetricDecrypt({ key: process.env.BETTER_AUTH_SECRET!, data: tf })) === TOTP, "el TOTP de Ana se descifra con BETTER_AUTH_SECRET (no re-enrola)")
    const eva = (await dst.query("select two_factor_enabled, mfa_reactivar from auth.users where id = $1", [u.eva])).rows[0]
    check(eva?.two_factor_enabled === false && eva?.mfa_reactivar === true, "TOTP cifrado por GoTrue → se pide reactivar al entrar")
    const dani = (await dst.query("select banned from auth.users where id = $1", [u.dani])).rows[0]
    check(dani?.banned === true, "la cuenta suspendida sigue suspendida")
    const anon = (await dst.query("select is_anonymous, (select count(*)::int from auth.accounts a where a.user_id = $1) as n from auth.users where id = $1", [u.anon])).rows[0]
    check(anon?.is_anonymous === true && anon.n === 0, "la cuenta anónima se lleva marcada y sin formas de entrar (su perfil no queda huérfano)")
    const trig = (await dst.query("select count(*)::int as n from pg_trigger where tgname in ('on_auth_user_created', 'on_auth_user_change')")).rows[0].n
    check(trig === 2, "triggers de auth.users instalados al cierre")

    log("\n▶ URL públicas")
    const before = await rewritePublicUrls(dst, FAKE_PREFIX, NEW_PREFIX, false)
    const n = before.reduce((s, x) => s + x.filas, 0)
    await rewritePublicUrls(dst, FAKE_PREFIX, NEW_PREFIX, true)
    const after = await rewritePublicUrls(dst, FAKE_PREFIX, NEW_PREFIX, false)
    check(n >= 2 && after.length === 0, `reescritas ${n} URL en ${before.map((x) => `${x.tabla}.${x.columna}`).join(", ")}; quedan 0`)

    log("\n▶ Vuelta atrás (lo nuevo del destino vuelve al origen)")
    const corte = new Date(Date.now() - 1000).toISOString()
    const nuevo = randomUUID()
    const bcryptHash = (requireApi("bcryptjs") as { hashSync(p: string, r: number): string }).hashSync("Clave-nueva-5", 10)
    await dst.query("insert into auth.users (id, email, name, email_verified, raw_user_meta_data) values ($1, 'nuevo@ensayo.mirai.test', 'Nuevo', true, '{\"nombre\":\"Nuevo\"}')", [nuevo])
    await dst.query("insert into auth.accounts (id, user_id, account_id, provider_id, password) values ($1, $2, $4, 'credential', $3)", [randomUUID(), nuevo, bcryptHash, nuevo])
    const cat = (await dst.query("insert into public.categories (book_id, nombre, grupo) values ($1, 'Después del corte', 'g') returning id", [bookAna])).rows[0].id
    await dst.query("update public.expenses set descripcion = 'Editado después del corte' where book_id = $1 and descripcion = 'Gasto 1'", [bookAna])
    const rep = await rollbackDelta(src, dst, corte)
    const back = (await src.query("select encrypted_password from auth.users where id = $1", [nuevo])).rows[0]
    check(rep.personas === 1 && back?.encrypted_password === bcryptHash, "la persona nueva vuelve a Supabase con el mismo hash")
    check((await src.query("select 1 from public.categories where id = $1", [cat])).rowCount === 1, "la categoría creada después del corte vuelve")
    check((await src.query("select 1 from public.expenses where book_id = $1 and descripcion = 'Editado después del corte'", [bookAna])).rowCount === 1, "el gasto editado después del corte vuelve")
    check((await src.query("select 1 from public.profiles where id = $1", [nuevo])).rowCount === 1, "y su perfil")
  } finally {
    await src.end()
    await dst.end()
  }

  log("\n▶ Archivos: storage-api local → MinIO")
  const keys = await localKeys()
  const up1 = async (bucket: string, path: string, body: string, type: string) => {
    const r = await fetch(`${LOCAL.supaUrl}/storage/v1/object/${bucket}/${path}`, { method: "POST", headers: { Authorization: `Bearer ${keys.service}`, "content-type": type, "x-upsert": "true" }, body })
    if (!r.ok) throw new Error(`No se pudo subir ${bucket}/${path} (${r.status})`)
  }
  await up1("attachments", "ensayo-v7/renta/2026/factura.pdf", "%PDF-1.4 ensayo", "application/pdf")
  await up1("attachments", "ensayo-v7/renta/2026/soporte.png", "png-de-mentiras", "image/png")
  await up1("avatars", "ensayo-v7/foto.webp", "webp-de-mentiras", "image/webp")
  const opts = { supabaseUrl: LOCAL.supaUrl, serviceKey: keys.service, s3: { endpoint: LOCAL.s3.endpoint, accessKeyId: LOCAL.s3.accessKey, secretAccessKey: LOCAL.s3.secretKey }, targets: { private: "mirai-local-private", backups: "mirai-local-backups", public: "mirai-local-public" }, prefix: "ensayo-v7" }
  const r1 = await storageCopy(opts)
  const r2 = await storageCopy(opts)
  check(r1.attachments?.objetos === 2 && r1.avatars?.objetos === 1 && Object.values(r1).every((x) => !x.distintos.length), `primera pasada: ${JSON.stringify(Object.fromEntries(Object.entries(r1).map(([k, v]) => [k, v.copiados])))} copiados, MD5 iguales`)
  check(Object.values(r2).every((x) => x.copiados === 0), "segunda pasada: nada que copiar (idempotente)")
  const pub = await fetch(`${NEW_PREFIX}avatars/ensayo-v7/foto.webp`)
  check(pub.ok && (await pub.text()) === "webp-de-mentiras", "el avatar se lee por la URL pública nueva (la misma que dejó la reescritura)")

  log(fails.length ? `\n✗ Ensayo con ${fails.length} fallas` : "\n✓ Ensayo completo sin diferencias")
  process.exitCode = fails.length ? 1 : 0
}

await main()
