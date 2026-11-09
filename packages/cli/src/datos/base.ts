// La base de datos local: qué tablas hay, cómo es cada una y consultas de SOLO LECTURA.
//
// Apunta siempre a la base LOCAL de Docker (infra/local). Nunca a producción: para eso está el túnel SSH
// de `pnpm db:migrate:vps`, que es otra cosa y con otros frenos.
import { Client } from "pg"
import { correr } from "./ejecutar.ts"
import type { Estado } from "./tipos.ts"

/** La base local de Docker. No es un secreto: estos valores solo existen en este computador. */
export const URL_LOCAL = process.env.MIRAI_CLI_DB_URL ?? "postgres://postgres:mirai-local@localhost:55432/mirai" // secretos:ok

export type Tabla = { nombre: string; filas: number; tamano: string; comentario?: string; rls: boolean }
export type Columna = { nombre: string; tipo: string; nulo: boolean; porDefecto?: string }
export type Politica = { nombre: string; orden: string; usando?: string }
export type Indice = { nombre: string; definicion: string }

async function conectar(): Promise<Client | null> {
  const c = new Client({ connectionString: URL_LOCAL, connectionTimeoutMillis: 4000 })
  try {
    await c.connect()
    return c
  } catch {
    return null
  }
}

export type Resultado<T> = { ok: true; datos: T } | { ok: false; msg: string }

const SIN_BASE = "No pude conectarme a la base local. Levanta 'Solo los servicios' o 'Desarrollo' desde Ambientes."

async function con<T>(trabajo: (c: Client) => Promise<T>): Promise<Resultado<T>> {
  const c = await conectar()
  if (!c) return { ok: false, msg: SIN_BASE }
  try {
    return { ok: true, datos: await trabajo(c) }
  } catch (e) {
    return { ok: false, msg: e instanceof Error ? e.message : "la consulta falló" }
  } finally {
    await c.end().catch(() => {})
  }
}

/** Todas las tablas del esquema público, con cuántas filas tienen y cuánto pesan. */
export function tablas(): Promise<Resultado<Tabla[]>> {
  return con(async (c) => {
    const r = await c.query<{ nombre: string; filas: string; tamano: string; comentario: string | null; rls: boolean }>(`
      select t.relname as nombre,
             coalesce(s.n_live_tup, 0)::text as filas,
             pg_size_pretty(pg_total_relation_size(t.oid)) as tamano,
             obj_description(t.oid) as comentario,
             t.relrowsecurity as rls
        from pg_class t
        join pg_namespace n on n.oid = t.relnamespace
        left join pg_stat_user_tables s on s.relid = t.oid
       where n.nspname = 'public' and t.relkind = 'r'
       order by t.relname
    `)
    return r.rows.map((x) => ({ nombre: x.nombre, filas: Number(x.filas), tamano: x.tamano, comentario: x.comentario ?? undefined, rls: x.rls }))
  })
}

/** Cómo es una tabla por dentro: columnas, índices y políticas de seguridad. */
export function detalleTabla(tabla: string): Promise<Resultado<{ columnas: Columna[]; indices: Indice[]; politicas: Politica[] }>> {
  return con(async (c) => {
    const [cols, idx, pol] = await Promise.all([
      c.query<{ nombre: string; tipo: string; nulo: string; pordefecto: string | null }>(
        `select column_name as nombre, data_type as tipo, is_nullable as nulo, column_default as pordefecto
           from information_schema.columns where table_schema='public' and table_name=$1 order by ordinal_position`,
        [tabla],
      ),
      c.query<{ nombre: string; definicion: string }>(`select indexname as nombre, indexdef as definicion from pg_indexes where schemaname='public' and tablename=$1`, [tabla]),
      c.query<{ nombre: string; orden: string; usando: string | null }>(`select policyname as nombre, cmd as orden, qual as usando from pg_policies where schemaname='public' and tablename=$1`, [tabla]),
    ])
    return {
      columnas: cols.rows.map((x) => ({ nombre: x.nombre, tipo: x.tipo, nulo: x.nulo === "YES", porDefecto: x.pordefecto ?? undefined })),
      indices: idx.rows,
      politicas: pol.rows.map((x) => ({ nombre: x.nombre, orden: x.orden, usando: x.usando ?? undefined })),
    }
  })
}

/** Las primeras filas de una tabla, para echarle un ojo. */
export function primerasFilas(tabla: string, limite = 20): Promise<Resultado<{ columnas: string[]; filas: unknown[][] }>> {
  if (!/^[a-z_][a-z0-9_]*$/.test(tabla)) return Promise.resolve({ ok: false as const, msg: "Ese nombre de tabla no es válido." })
  return con(async (c) => {
    const r = await c.query(`select * from "${tabla}" limit ${Math.min(200, Math.max(1, limite))}`)
    return { columnas: r.fields.map((f) => f.name), filas: r.rows.map((fila) => r.fields.map((f) => (fila as Record<string, unknown>)[f.name])) }
  })
}

/** Palabras que escriben o cambian cosas: aquí no se permiten. */
const ESCRIBE = /\b(insert|update|delete|drop|truncate|alter|create|grant|revoke|copy|vacuum|reindex|refresh|call|do|set|reset)\b/i

/**
 * Una consulta de SOLO LECTURA. Dos frenos: se revisa el texto y además la transacción es read only,
 * así que aunque algo se cuele, Postgres lo rechaza.
 */
export function consultar(sql: string, limite = 100): Promise<Resultado<{ columnas: string[]; filas: unknown[][]; ms: number }>> {
  const limpio = sql.trim().replace(/;+\s*$/, "")
  if (!limpio) return Promise.resolve({ ok: false as const, msg: "Escribe una consulta." })
  if (limpio.includes(";")) return Promise.resolve({ ok: false as const, msg: "Una consulta a la vez (sin ';' en la mitad)." })
  if (ESCRIBE.test(limpio)) return Promise.resolve({ ok: false as const, msg: "Esta ventana es de solo lectura: usa select, con o explain." })
  if (!/^\s*(select|with|explain|table|show)\b/i.test(limpio)) return Promise.resolve({ ok: false as const, msg: "Solo acepta select, with, explain, table o show." })
  return con(async (c) => {
    const inicio = Date.now()
    await c.query("begin transaction read only")
    try {
      const r = await c.query(`select * from (${limpio}) as consulta limit ${Math.min(500, Math.max(1, limite))}`)
      return { columnas: r.fields.map((f) => f.name), filas: r.rows.map((fila) => r.fields.map((f) => (fila as Record<string, unknown>)[f.name])), ms: Date.now() - inicio }
    } finally {
      await c.query("rollback").catch(() => {})
    }
  })
}

/** Un vistazo general: si responde, qué versión es y cuántas tablas tiene. */
export async function estadoBase(): Promise<{ estado: Estado; detalle: string; version?: string; tablas?: number }> {
  const c = await conectar()
  if (!c) return { estado: "apagado", detalle: "la base local no responde (levanta un ambiente)" }
  try {
    const [v, t] = await Promise.all([
      c.query<{ version: string }>("select version() as version"),
      c.query<{ n: string }>("select count(*)::text as n from pg_class t join pg_namespace n on n.oid=t.relnamespace where n.nspname='public' and t.relkind='r'"),
    ])
    const version = /PostgreSQL ([\d.]+)/.exec(v.rows[0]?.version ?? "")?.[1] ?? "?"
    return { estado: "ok", detalle: `Postgres ${version} · ${t.rows[0]?.n} tablas`, version, tablas: Number(t.rows[0]?.n) }
  } catch {
    return { estado: "error", detalle: "conecté pero no pude consultarla" }
  } finally {
    await c.end().catch(() => {})
  }
}

/** Copia de la base local a un archivo (formato de Postgres, comprimido). */
export async function copiar(destino: string): Promise<{ ok: boolean; msg: string }> {
  const r = await correr("docker", ["exec", "mirai-local-db-1", "pg_dump", "-U", "postgres", "-Fc", "mirai"], { ms: 180000 })
  if (!r.ok) return { ok: false, msg: `No pude copiar la base: ${r.err.split("\n")[0] || "¿está arriba el contenedor?"}` }
  const { writeFile } = await import("node:fs/promises")
  await writeFile(destino, r.out, "binary")
  return { ok: true, msg: `Copia guardada en ${destino}` }
}
