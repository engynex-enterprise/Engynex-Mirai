// Importa el estado `S` de Mirai 4.0 (respaldo JSON o localStorage) a un libro. Portado 1:1 de importV4 de
// apps/web/features/import/v4.ts: mismas tablas, mismas reglas (catálogos reutilizados por nombre, titular de la v4 →
// titular del hogar, bienes de la renta enlazados a sus activos) y mismo reporte. En vez de supabase-js habla con el
// puerto RowStore con el alcance que le pasen (la persona: la RLS de la base vuelve a revisar, como en la web).
// Cuando la web deje de tener backend se borra apps/web/features/import/v4.ts y queda solo esta versión.
/* eslint-disable @typescript-eslint/no-explicit-any */
import type { TableName } from "@mirai/db/tables"
import type { DbScope } from "../../../core/db/scope"
import type { RowStore } from "../../../core/store/row-store"

export type ImportReport = Record<string, number>

const uid = () => crypto.randomUUID()
const lc = (s: unknown) => String(s ?? "").toLowerCase().trim()
const n = (v: unknown) => Number(v) || 0

export async function importV4(store: RowStore, scope: DbScope, bookId: string, householdId: string, S: any): Promise<ImportReport> {
  const rep: ImportReport = {}
  const ins = async (table: TableName, rows: any[]) => {
    if (!rows.length) return
    for (let i = 0; i < rows.length; i += 500) await store.insert(scope, table, rows.slice(i, i + 500))
    rep[table] = (rep[table] ?? 0) + rows.length
  }
  const byId = (id: string) => ({ eq: { id } })
  const cfg = S.cfg ?? {}

  // ── Ajustes del libro
  await store.update(scope, "book_settings", { eq: { book_id: bookId } }, {
    meta: S.perfil?.meta ?? "", umbral: n(cfg.umbral) || 25000, limite: n(cfg.limite) || 250000, trm: cfg.trm ?? { USD: 4100, EUR: 4450 },
    pct: cfg.pct ?? { n: 50, g: 30, a: 20 }, emerg_meta: n(cfg.emergMeta) || 6, anticipo: n(cfg.anticipo) || 5, usura: n(cfg.usura) || 26,
    corte_q: Math.min(27, Math.max(1, n(cfg.corteQ) || 15)), alerta_pres: n(cfg.alertaPres) || 100, estricto: cfg.estricto ?? "equilibrado",
    notif: cfg.notif ?? undefined, ia: cfg.ia ?? undefined, relaciones: Array.isArray(cfg.relaciones) ? cfg.relaciones : undefined,
    uvt: cfg.uvt ?? {}, smmlv: cfg.smmlv ?? {}, setup: S.setup ?? undefined,
  })

  // ── Integrantes (por hogar). El titular existente recibe al "Titular" de la v4.
  const memberMap = new Map<string, string>()
  const existing = await store.select<{ id: string; nombre: string; es_titular: boolean }>(scope, "family_members", { columns: ["id", "nombre", "es_titular"], eq: { household_id: householdId, deleted_at: null } })
  const titular = existing.find((m) => m.es_titular)
  const newMembers: any[] = []
  for (const m of S.perfil?.miembros ?? []) {
    if (/titular/i.test(m.rol ?? "") && titular) {
      memberMap.set(m.id, titular.id)
      await store.update(scope, "family_members", byId(titular.id), { cupo: n(m.cupo) })
      continue
    }
    const same = existing.find((e) => lc(e.nombre) === lc(m.nombre))
    if (same) {
      memberMap.set(m.id, same.id)
      continue
    }
    const id = uid()
    memberMap.set(m.id, id)
    newMembers.push({ id, household_id: householdId, nombre: m.nombre, rol: m.rol || "Otro", cupo: n(m.cupo), nacimiento: m.nac || null, doc: m.doc ?? "",
      dep_rel: m.depRel || null, estudia: !!m.estudia, sin_ingresos: m.sinIng !== false, discapacidad: !!m.discap })
  }
  await ins("family_members", newMembers)
  for (const m of S.perfil?.miembros ?? []) if (m.depDe && memberMap.get(m.depDe)) await store.update(scope, "family_members", byId(memberMap.get(m.id)!), { dep_de: memberMap.get(m.depDe) })
  const who = (q: any) => (q && q !== "familia" ? memberMap.get(q) ?? null : null)

  // ── Catálogos (se reutilizan por nombre)
  const byName = async (table: "categories" | "income_categories" | "entities" | "payment_methods", list: any[], extra: (x: any) => any) => {
    const data = await store.select<{ id: string; nombre: string }>(scope, table, { columns: ["id", "nombre"], eq: { book_id: bookId, deleted_at: null } })
    const map = new Map<string, string>(data.map((r) => [lc(r.nombre), r.id]))
    const add: any[] = []
    for (const x of list ?? []) {
      const k = lc(x.nombre)
      if (map.has(k)) {
        await store.update(scope, table, byId(map.get(k)!), extra(x))
        continue
      }
      const id = uid()
      map.set(k, id)
      add.push({ id, book_id: bookId, nombre: x.nombre, ...extra(x) })
    }
    await ins(table, add)
    return (name: unknown) => map.get(lc(name)) ?? null
  }
  const cat = await byName("categories", cfg.categorias, (c) => ({ grupo: c.grupo || "g", icon: c.icon || "tag", tope: n(c.tope) }))
  const catIng = await byName("income_categories", cfg.catIngreso, (c) => ({ icon: c.icon || "coins" }))
  const ent = await byName("entities", cfg.entidades, (e) => ({ tipo: ["Banco", "Cooperativa", "Fintech", "Billetera", "Fondo"].includes(e.tipo) ? e.tipo : "Otro", nit: e.nit ?? "" }))
  const medio = await byName("payment_methods", cfg.medios, (m) => ({ icon: m.icon || "banknote" }))
  await ins("keyword_rules", (cfg.reglas ?? []).filter((r: any) => r.k).map((r: any) => ({ book_id: bookId, keyword: r.k, category_id: cat(r.cat) })))

  // ── Contactos
  const contactMap = new Map<string, string>()
  await ins("contacts", (S.contactos ?? []).map((c: any) => {
    const id = uid()
    contactMap.set(c.id, id)
    return { id, book_id: bookId, tipo: c.tipo === "empresa" ? "empresa" : "persona", nombre: c.nombre || "Contacto", doc_tipo: c.docTipo || "CC", doc: String(c.doc ?? ""),
      telefono: c.telefono ?? "", email: c.email ?? "", ciudad: c.ciudad ?? "", relacion: c.relacion ?? "", notas: c.notas ?? "",
      direccion: { dir: c.direccion ?? "", ciudad: c.ciudad ?? "", barrio: c.barrio ?? "", depto: c.depto ?? "" } }
  }))

  // ── Ingresos y extras
  await ins("incomes", (S.ingresos ?? []).map((x: any) => ({ book_id: bookId, concepto: x.concepto || "Ingreso", category_id: catIng(x.cat), valor: n(x.valor),
    frec: ["mensual", "quincenal", "semanal", "anual"].includes(x.frec) ? x.frec : "mensual", dia: Math.min(31, Math.max(1, n(x.dia) || 30)),
    member_id: who(x.quien), currency: x.moneda || "COP", bruto: n(x.bruto) || null, deducciones: x.desc ?? null })))
  await ins("extra_incomes", (S.extras ?? []).map((x: any) => ({ book_id: bookId, fecha: x.fecha, descripcion: x.desc ?? "", valor: n(x.valor) })))

  // ── Gastos fijos (+ sus gastos y pagos)
  const fixedMap = new Map<string, string>()
  const goalMap = new Map<string, string>()
  for (const g of S.metas ?? []) goalMap.set(g.id, uid())
  await ins("fixed_expenses", (S.fijos ?? []).map((f: any) => {
    const id = uid()
    fixedMap.set(f.id, id)
    return { id, book_id: bookId, nombre: f.nombre || "Gasto fijo", category_id: cat(f.cat), valor: n(f.valor),
      frec: ["mensual", "quincenal", "bimestral", "trimestral", "semestral", "anual", "unico"].includes(f.frec) ? f.frec : "mensual",
      dia: Math.min(31, Math.max(1, n(f.dia) || 1)), dia2: f.frec === "quincenal" ? Math.min(31, Math.max(16, n(f.dia2) || 30)) : null,
      mes: f.mes ? Math.min(12, Math.max(1, n(f.mes))) : null, fecha_unica: f.fecha || null, inicio: f.inicio || null, variable: !!f.variable,
      vmin: f.vmin ? n(f.vmin) : null, vmax: f.vmax ? n(f.vmax) : null, payment_method_id: medio(f.medio), proveedor: f.proveedor ?? "", desde: f.desde || new Date().toISOString().slice(0, 7),
      link_type: f.link?.t ?? null, link_id: f.link?.t === "meta" ? goalMap.get(f.link.id) ?? null : null }
  }))

  // ── Gastos
  const expMap = new Map<string, string>()
  await ins("expenses", (S.gastos ?? []).map((g: any) => {
    const id = uid()
    expMap.set(g.id, id)
    return { id, book_id: bookId, fecha: g.fecha, descripcion: g.desc ?? "", category_id: cat(g.cat), valor: n(g.valor), member_id: who(g.quien),
      payment_method_id: medio(g.medio), fixed_expense_id: g.fijoId ? fixedMap.get(g.fijoId) ?? null : null, periodo: g.per ?? null,
      hormiga: typeof g.hormiga === "boolean" ? g.hormiga : false, hormiga_src: typeof g.hormiga === "boolean" ? (g.hormigaSrc === "ia" ? "ia" : "manual") : null,
      hormiga_razon: g.hormigaRazon ?? null, fondo_valor: n(g.fondo), origen: "importar" }
  }))
  const payRows: any[] = []
  for (const f of S.fijos ?? []) for (const p of f.pagos ?? []) {
    const g = (S.gastos ?? []).find((x: any) => x.fijoId === f.id && x.per === p.per)
    payRows.push({ book_id: bookId, fixed_expense_id: fixedMap.get(f.id), periodo: p.per, fecha: p.fecha, valor: n(p.valor), payment_method_id: medio(p.medio ?? f.medio), expense_id: g ? expMap.get(g.id) : null })
  }
  await ins("fixed_expense_payments", payRows)

  // ── Suscripciones
  await ins("subscriptions", (S.suscripciones ?? []).map((s: any) => ({ book_id: bookId, nombre: s.nombre, valor: n(s.valor), currency: s.moneda || "COP",
    ciclo: s.ciclo === "anual" ? "anual" : "mensual", proximo: s.proximo || null, comparte: Math.max(1, n(s.comparte) || 1), payment_method_id: medio(s.medio),
    category_id: cat("Suscripciones"), logo_path: s.logo ?? null })))

  // ── Préstamos (+ pagos)
  const loanRows: any[] = [], loanPays: any[] = []
  for (const kind of ["cobrar", "pagar"] as const) for (const L of S[kind] ?? []) {
    const id = uid()
    const acr = L.acreedor ?? {}
    loanRows.push({ id, book_id: bookId, kind, concepto: L.concepto ?? "", monto: n(L.monto), currency: L.moneda || "COP",
      sistema: ["frances", "aleman", "simple", "sin", "americano"].includes(L.sistema) ? L.sistema : "frances", tasa: n(L.tasa),
      frec: ["mensual", "quincenal", "semanal", "diario", "diariohab"].includes(L.frec) ? L.frec : "mensual", plazo: Math.max(1, n(L.plazo) || 1), inicio: L.inicio,
      extra: n(L.extra), prenda: L.prenda ?? null,
      contact_id: kind === "cobrar" ? contactMap.get(L.contactoId) ?? null : acr.kind === "contacto" ? contactMap.get(acr.id) ?? null : null,
      entity_id: kind === "pagar" && acr.kind !== "contacto" ? ent((cfg.entidades ?? []).find((e: any) => e.id === acr.id)?.nombre) : null })
    for (const p of L.pagos ?? []) loanPays.push({ book_id: bookId, loan_id: id, fecha: p.fecha, tipo: p.tipo === "abono" ? "abono" : "cuota", valor: n(p.valor), modo: p.modo === "plazo" ? "plazo" : p.modo === "cuota" ? "cuota" : null })
  }
  await ins("loans", loanRows)
  await ins("loan_payments", loanPays)

  // ── Patrimonio, inversiones, metas, calendario
  // Id nuevo de cada activo: los bienes de la renta quedan enlazados (asset_id) y no se cuentan dos veces en el patrimonio.
  const assetMap = new Map<string, string>(), assetByName = new Map<string, string>()
  await ins("assets", (S.activos ?? []).map((a: any) => {
    const id = uid()
    if (a.id) assetMap.set(a.id, id)
    if (a.nombre && !assetByName.has(lc(a.nombre))) assetByName.set(lc(a.nombre), id)
    return { id, book_id: bookId, cod: String(a.cod ?? "1995"), nombre: a.nombre, valor: n(a.valor), currency: a.moneda || "COP" }
  }))
  await ins("liabilities", (S.pasivos ?? []).map((a: any) => ({ book_id: bookId, cod: String(a.cod ?? "2895"), nombre: a.nombre, valor: n(a.valor), currency: a.moneda || "COP" })))
  await ins("investments", (S.inversiones ?? []).map((x: any) => ({ book_id: bookId, tipo: ["cdt", "ahorro", "fondo", "acciones", "cripto", "otro"].includes(x.tipo) ? x.tipo : "otro",
    nombre: x.nombre, entity_id: ent((cfg.entidades ?? []).find((e: any) => e.id === x.entidad)?.nombre), capital: n(x.capital), tasa: n(x.tasa), inicio: x.inicio,
    dias: x.dias ? n(x.dias) : null, ret: n(x.ret), currency: x.moneda || "COP", actual: x.actual != null ? n(x.actual) : null })))
  await ins("goals", (S.metas ?? []).map((g: any) => ({ id: goalMap.get(g.id), book_id: bookId, nombre: g.nombre, objetivo: n(g.objetivo), ahorrado: n(g.ahorrado), fecha: g.fecha || null, icon: g.icon || "target" })))
  const calExisting = await store.select<{ titulo: string }>(scope, "calendar_events", { columns: ["titulo"], eq: { book_id: bookId, deleted_at: null } })
  await ins("calendar_events", (S.calendario ?? []).filter((c: any) => !calExisting.some((e) => lc(e.titulo) === lc(c.titulo)))
    .map((c: any) => ({ book_id: bookId, titulo: c.titulo, fecha: c.fecha, tipo: c.tipo === "ingreso" ? "ingreso" : "egreso", monto: n(c.monto), nota: c.nota ?? "" })))

  // ── Tarjetas (+ compras)
  const cardRows: any[] = [], purch: any[] = []
  for (const t of S.tarjetas ?? []) {
    const id = uid()
    cardRows.push({ id, book_id: bookId, nombre: t.nombre, entity_id: ent(t.entidad), cupo: n(t.cupo), corte: Math.min(31, Math.max(1, n(t.corte) || 25)), pago: Math.min(31, Math.max(1, n(t.pago) || 10)), tasa: n(t.tasa) })
    for (const c of t.compras ?? []) purch.push({ book_id: bookId, card_id: id, fecha: c.fecha, descripcion: c.desc ?? "", valor: n(c.valor), cuotas: Math.max(1, n(c.cuotas) || 1), category_id: cat(c.cat), pagada: !!c.pagada })
  }
  await ins("credit_cards", cardRows)
  await ins("card_purchases", purch)

  // ── Fondo de emergencia
  if (S.fondo) {
    await store.update(scope, "emergency_funds", { eq: { book_id: bookId } }, { activo: !!S.fondo.on, saldo: n(S.fondo.saldo) })
    await ins("fund_movements", (S.fondo.mov ?? []).map((m: any) => ({ book_id: bookId, tipo: m.tipo === "usar" ? "usar" : "guardar", valor: n(m.valor), fecha: m.fecha, nota: m.nota ?? "", expense_id: m.gid ? expMap.get(m.gid) ?? null : null })))
  }

  // ── Gastos compartidos, mesadas y retos
  for (const g of S.grupos ?? []) {
    const id = uid()
    await ins("shared_groups", [{ id, book_id: bookId, nombre: g.nombre, personas: g.personas ?? [] }])
    await ins("shared_group_expenses", (g.gastos ?? []).map((x: any) => ({ book_id: bookId, group_id: id, descripcion: x.desc ?? "", valor: n(x.valor), paga: x.paga, entre: x.entre ?? [], fecha: x.fecha })))
  }
  for (const [mid, k] of Object.entries<any>(S.kids ?? {})) {
    const member = memberMap.get(mid)
    if (!member) continue
    const id = uid()
    await ins("allowances", [{ id, book_id: bookId, member_id: member, mesada: n(k.mesada) || 20000, frec: ["semanal", "quincenal", "mensual"].includes(k.frec) ? k.frec : "semanal", meta_nombre: k.meta?.nombre ?? "", meta_valor: n(k.meta?.valor) }])
    await ins("allowance_movements", (k.mov ?? []).map((m: any) => ({ book_id: bookId, allowance_id: id, fecha: m.fecha, descripcion: m.desc ?? "", valor: n(m.valor) })))
  }
  await ins("savings_challenges", (S.retos ?? []).map((r: any) => ({ book_id: bookId, k: r.k, tipo: r.tipo ?? r.k, category_id: cat(r.cat), dias: r.dias ?? null, base: n(r.base), n: r.n ?? null, inicio: r.inicio, marcas: r.marcas ?? [] })))

  // ── Renta (por año y persona) y bienes
  const titularId = titular?.id
  for (const [y, R] of Object.entries<any>(S.renta ?? {})) {
    const por = R.por ?? (titularId ? { __t: { docs: R.docs, consig: R.consig, consumos: R.consumos } } : {})
    for (const [mid, P] of Object.entries<any>(por)) {
      const member = mid === "__t" ? titularId : memberMap.get(mid) ?? titularId
      if (!member) continue
      await ins("tax_years", [{ book_id: bookId, year: +y, member_id: member, docs: P.docs ?? {}, consig: n(P.consig), consumos: n(P.consumos), ing: P.ing ?? {}, ded: P.ded ?? {} }])
    }
  }
  await ins("tax_assets", (S.bienes ?? []).map((b: any) => ({ book_id: bookId, tipo: ["inmueble", "vehiculo", "cuenta", "inversion", "cripto", "exterior", "cobrar", "otro"].includes(b.tipo) ? b.tipo : "otro",
    nombre: b.nombre, ident: b.ident ?? "", entidad: b.entidad ?? "", costo: n(b.costo), avaluo: n(b.avaluo), valor31: n(b.valor31), fecha_adq: b.fechaAdq || null,
    member_id: memberMap.get(b.duenio) ?? titularId ?? null, pct: Math.min(100, Math.max(1, n(b.pct) || 100)), predial: b.predial ? n(b.predial) : null, imp_veh: b.impVeh ? n(b.impVeh) : null, soat: b.soat ? n(b.soat) : null,
    asset_id: (b.aid && assetMap.get(b.aid)) || (b.nombre && assetByName.get(lc(b.nombre))) || null })))

  return rep
}
