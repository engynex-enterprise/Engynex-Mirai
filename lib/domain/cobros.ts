// "Recibe pagos" (Perfil): entidades de Colombia, llaves Bre-B y cuentas para que te paguen.
// Se guarda en profiles.cobro (jsonb) como una lista plana. Cada elemento conserva los campos de la 5.4
// (medio, detalle, tipo, banco, titular) para que la versión publicada lo siga leyendo, y agrega los de la 5.5
// (entidad, clase, llave, alias, principal, doc_tipo, doc). El orden de la lista es el orden en pantalla.

export type EntidadGrupo = "billetera" | "banco" | "cooperativa" | "otro"
/** cel: la "cuenta" de la entidad es el número de celular (Nequi, Daviplata…). */
export type Entidad = { k: string; n: string; g: EntidadGrupo; brand?: string; cel?: boolean; clases: CobroClase[]; kw?: string }
export type CobroClase = "llave" | "cuenta" | "enlace"
export type LlaveTipo = "celular" | "cedula" | "correo" | "alfanumerica" | "comercio"
export type CuentaTipo = "ahorros" | "corriente"

/** Un medio para recibir pagos (formato guardado; los campos de la 5.4 siguen ahí). */
export type Cobro = {
  id: string
  /** 5.4: breb | nequi | daviplata | bancolombia | davivienda | bbva | nubank | otro */
  medio: string
  detalle: string
  tipo?: CuentaTipo
  /** 5.4: nombre del banco cuando medio = "otro". En la 5.5 siempre lleva el nombre de la entidad. */
  banco?: string
  titular?: string
  entidad?: string
  clase?: CobroClase
  llave?: LlaveTipo
  alias?: string
  principal?: boolean
  doc_tipo?: string
  doc?: string
}

const LC: CobroClase[] = ["llave", "cuenta"]
/** Entidades de Colombia. Agrupadas en el selector; el orden dentro del grupo es el de la lista. */
export const ENTIDADES: Entidad[] = [
  { k: "nequi", n: "Nequi", g: "billetera", brand: "nequi", cel: true, clases: LC },
  { k: "daviplata", n: "Daviplata", g: "billetera", brand: "daviplata", cel: true, clases: LC },
  { k: "movii", n: "MOVii", g: "billetera", brand: "movii", cel: true, clases: LC },
  { k: "dale", n: "dale!", g: "billetera", brand: "dale", cel: true, clases: LC },
  { k: "powwi", n: "Powwi", g: "billetera", brand: "powwi", cel: true, clases: LC },
  { k: "rappipay", n: "RappiPay", g: "billetera", brand: "rappipay", clases: LC },
  { k: "uala", n: "Ualá", g: "billetera", brand: "uala", clases: LC },
  { k: "global66", n: "Global66", g: "billetera", brand: "global66", clases: LC },
  { k: "bancolombia", n: "Bancolombia", g: "banco", brand: "bancolombia", clases: LC },
  { k: "davivienda", n: "Davivienda", g: "banco", brand: "davivienda", clases: LC },
  { k: "banco-bogota", n: "Banco de Bogotá", g: "banco", brand: "banco-bogota", clases: LC, kw: "bogota" },
  { k: "bbva", n: "BBVA", g: "banco", brand: "bbva", clases: LC },
  { k: "occidente", n: "Banco de Occidente", g: "banco", brand: "occidente", clases: LC, kw: "occidente" },
  { k: "banco-popular", n: "Banco Popular", g: "banco", brand: "banco-popular", clases: LC, kw: "popular" },
  { k: "av-villas", n: "AV Villas", g: "banco", brand: "av-villas", clases: LC, kw: "villas" },
  { k: "caja-social", n: "Banco Caja Social", g: "banco", brand: "caja-social", clases: LC, kw: "caja social" },
  { k: "colpatria", n: "Scotiabank Colpatria", g: "banco", brand: "colpatria", clases: LC, kw: "colpatria|scotiabank" },
  { k: "itau", n: "Itaú", g: "banco", brand: "itau", clases: LC, kw: "itau" },
  { k: "banco-agrario", n: "Banco Agrario", g: "banco", brand: "banco-agrario", clases: LC, kw: "agrario" },
  { k: "falabella", n: "Banco Falabella", g: "banco", brand: "falabella", clases: LC, kw: "falabella" },
  { k: "pichincha", n: "Banco Pichincha", g: "banco", brand: "pichincha", clases: LC, kw: "pichincha" },
  { k: "gnb-sudameris", n: "GNB Sudameris", g: "banco", brand: "gnb-sudameris", clases: LC, kw: "gnb|sudameris" },
  { k: "finandina", n: "Banco Finandina", g: "banco", brand: "finandina", clases: LC, kw: "finandina" },
  { k: "bancamia", n: "Bancamía", g: "banco", brand: "bancamia", clases: LC, kw: "bancamia" },
  { k: "banco-w", n: "Banco W", g: "banco", brand: "banco-w", clases: LC, kw: "banco w\\b" },
  { k: "mundo-mujer", n: "Banco Mundo Mujer", g: "banco", brand: "mundo-mujer", clases: LC, kw: "mundo mujer" },
  { k: "lulo", n: "Lulo Bank", g: "banco", brand: "lulo", clases: LC, kw: "lulo" },
  { k: "nubank", n: "Nu", g: "banco", brand: "nubank", clases: LC, kw: "\\bnu\\b|nubank" },
  { k: "coopcentral", n: "Banco Cooperativo Coopcentral", g: "cooperativa", brand: "coopcentral", clases: LC, kw: "coopcentral" },
  { k: "confiar", n: "Confiar Cooperativa Financiera", g: "cooperativa", brand: "confiar", clases: LC, kw: "confiar" },
  { k: "cotrafa", n: "Cotrafa Cooperativa Financiera", g: "cooperativa", brand: "cotrafa", clases: LC, kw: "cotrafa" },
  { k: "jfk", n: "JFK Cooperativa Financiera", g: "cooperativa", brand: "jfk", clases: LC, kw: "jfk" },
  { k: "breb", n: "Bre-B", g: "otro", brand: "breb", clases: ["llave"] },
  { k: "transfiya", n: "Transfiya", g: "otro", brand: "transfiya", cel: true, clases: ["cuenta"] },
  { k: "pse", n: "PSE", g: "otro", brand: "pse", clases: ["enlace"] },
  { k: "otro", n: "Otra entidad", g: "otro", clases: LC },
]
export const GRUPOS: { g: EntidadGrupo; n: string }[] = [
  { g: "billetera", n: "Billeteras" }, { g: "banco", n: "Bancos" }, { g: "cooperativa", n: "Cooperativas" }, { g: "otro", n: "Otros" },
]
const BY_KEY = new Map(ENTIDADES.map((e) => [e.k, e]))
/** Claves que la versión 5.4 conoce en `medio`; las demás se guardan como "otro" con el nombre en `banco`. */
const MEDIOS_54 = new Set(["breb", "nequi", "daviplata", "bancolombia", "davivienda", "bbva", "nubank", "otro"])

export const entidad = (k: string | undefined) => BY_KEY.get(k ?? "") ?? BY_KEY.get("otro")!
const norm = (s: string) => s.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").trim()
/** Entidad cuyo nombre aparece en un texto libre ("Banco de Bogotá", "bogota"). */
export function entidadPorNombre(text: string | undefined): string | null {
  if (!text?.trim()) return null
  const t = norm(text)
  const e = ENTIDADES.find((x) => x.k !== "otro" && (norm(x.n) === t || (x.kw ? new RegExp(x.kw).test(t) : t.includes(norm(x.n)))))
  return e?.k ?? null
}
/** Nombre que se muestra: el de la entidad o, si es "otra", el que escribió la persona. */
export const nombreEntidad = (c: Pick<Cobro, "entidad" | "banco">) => (!c.entidad || c.entidad === "otro" ? c.banco?.trim() || "Otra entidad" : entidad(c.entidad).n)

export const soloDig = (s: string) => s.replace(/\D/g, "")

// ——— Llaves Bre-B ———
export const LLAVES: { v: LlaveTipo; n: string; ej: string }[] = [
  { v: "celular", n: "Celular", ej: "300 123 4567" },
  { v: "cedula", n: "Cédula o NIT", ej: "1020345678" },
  { v: "correo", n: "Correo", ej: "tu@correo.com" },
  { v: "alfanumerica", n: "Alfanumérica (@)", ej: "@tunombre" },
  { v: "comercio", n: "Código de comercio", ej: "0012345678" },
]
export const llaveNombre = (t: LlaveTipo | undefined) => LLAVES.find((x) => x.v === t)?.n ?? "Llave"

/** Celular colombiano en 10 dígitos (quita +57 y separadores). */
export function celularCO(s: string) {
  let d = soloDig(s)
  if (d.length === 12 && d.startsWith("57")) d = d.slice(2)
  return d
}

/** Tipo de llave según lo que se escribe: @ al inicio → alfanumérica; con @ → correo; 3 + 9 dígitos → celular; números → cédula. */
export function detectarLlave(s: string): LlaveTipo | null {
  const t = s.trim()
  if (!t) return null
  if (t.startsWith("@")) return "alfanumerica"
  if (t.includes("@")) return "correo"
  if (/^[\d\s.+()-]+$/.test(t)) {
    // Mientras escribe: empieza por 3 y no pasa de 10 dígitos → celular (si es una cédula, la persona lo cambia)
    return /^3\d{0,9}$/.test(celularCO(t)) ? "celular" : "cedula"
  }
  return "alfanumerica"
}

const RE_CORREO = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/
/** Error en español o null si la llave es válida. */
export function validarLlave(tipo: LlaveTipo, s: string): string | null {
  const t = s.trim()
  if (!t) return "Escribe tu llave"
  switch (tipo) {
    case "celular": return /^3\d{9}$/.test(celularCO(t)) ? null : "El celular debe tener 10 dígitos y empezar por 3"
    case "cedula": return /^[\d\s.-]+$/.test(t) && /^\d{5,11}$/.test(soloDig(t)) ? null : "El documento debe tener solo números (entre 5 y 11)"
    case "correo": return RE_CORREO.test(t) ? null : "Escribe un correo válido, por ejemplo tu@correo.com"
    case "alfanumerica":
      if (!t.startsWith("@")) return "La llave alfanumérica empieza por @"
      return /^@[A-Za-z0-9._-]{2,30}$/.test(t) ? null : "Después de la @ usa de 2 a 30 letras o números, sin espacios"
    case "comercio": return /^[\d\s-]+$/.test(t) && /^\d{4,20}$/.test(soloDig(t)) ? null : "El código de comercio tiene solo números"
  }
}
/** Cómo se guarda la llave: números sin separadores; correo en minúscula. */
export function limpiarLlave(tipo: LlaveTipo, s: string) {
  const t = s.trim()
  if (tipo === "celular") return celularCO(t)
  if (tipo === "cedula" || tipo === "comercio") return soloDig(t)
  if (tipo === "correo") return t.toLowerCase()
  return t
}

// ——— Cuentas ———
/** Error en español o null. Si la entidad usa el celular como cuenta, valida un celular. */
export function validarCuenta(s: string, cel = false): string | null {
  const t = s.trim()
  if (!t) return cel ? "Escribe el número de celular" : "Escribe el número de cuenta"
  if (cel) return /^3\d{9}$/.test(celularCO(t)) ? null : "El celular debe tener 10 dígitos y empezar por 3"
  if (!/^[\d\s.-]+$/.test(t)) return "El número de cuenta debe tener solo números"
  const n = soloDig(t).length
  return n >= 6 && n <= 20 ? null : "El número de cuenta debe tener entre 6 y 20 dígitos"
}
export function validarEnlace(s: string): string | null {
  const t = s.trim()
  if (!t) return "Escribe el enlace de pago"
  try { const u = new URL(t); return u.protocol === "https:" || u.protocol === "http:" ? null : "El enlace debe empezar por https://" } catch { return "El enlace debe empezar por https://" }
}

// ——— Mostrar, enmascarar y copiar ———
const fmtCel = (d: string) => d.replace(/^(\d{3})(\d{3})(\d{4})$/, "$1 $2 $3")
const fmtDoc = (d: string) => d.replace(/\B(?=(\d{3})+(?!\d))/g, ".")
/** Valor tal como se muestra (celular con espacios, cédula con puntos). */
export function mostrar(c: Cobro): string {
  const n = normalizarUno(c)
  if (n.clase === "llave") {
    if (n.llave === "celular") return fmtCel(celularCO(n.detalle))
    if (n.llave === "cedula") return fmtDoc(soloDig(n.detalle))
    return n.detalle
  }
  if (n.clase === "cuenta" && entidad(n.entidad).cel) return fmtCel(celularCO(n.detalle))
  return n.detalle
}
/** Valor para pegar en la app del banco: solo números en celulares, documentos y cuentas. */
export function paraCopiar(c: Cobro): string {
  const n = normalizarUno(c)
  if (n.clase === "enlace" || (n.clase === "llave" && (n.llave === "correo" || n.llave === "alfanumerica"))) return n.detalle.trim()
  return n.clase === "llave" && n.llave === "celular" ? celularCO(n.detalle) : soloDig(n.detalle) || n.detalle.trim()
}
/** Oculta todo menos el final: "••• ••• 4567", "al•••@gmail.com", "@al•••", "•••• 8901". */
export function enmascarar(c: Cobro): string {
  const n = normalizarUno(c)
  const v = n.detalle.trim()
  if (n.clase === "enlace") { try { return `${new URL(v).host}/•••` } catch { return "•••" } }
  if (n.clase === "llave" && n.llave === "correo") {
    const [u, d] = v.split("@")
    return `${u.slice(0, Math.min(2, Math.max(1, u.length - 1)))}•••@${d ?? ""}`
  }
  if (n.clase === "llave" && n.llave === "alfanumerica") return `${v.slice(0, Math.min(3, v.length))}•••`
  const d = soloDig(v)
  if (!d) return "•••"
  if ((n.clase === "llave" && n.llave === "celular") || (n.clase === "cuenta" && entidad(n.entidad).cel)) return `••• ••• ${d.slice(-4)}`
  return `•••• ${d.slice(-4)}`
}
/** Título corto de un elemento: "Llave Bre-B · Celular", "Cuenta de ahorros", "Número Nequi", "Enlace de pago". */
export function etiqueta(c: Cobro): string {
  const n = normalizarUno(c)
  if (n.clase === "llave") return `Llave Bre-B · ${llaveNombre(n.llave)}`
  if (n.clase === "enlace") return "Enlace de pago"
  if (entidad(n.entidad).cel) return n.entidad === "transfiya" ? "Celular para Transfiya" : `Número ${nombreEntidad(n)}`
  return n.tipo === "corriente" ? "Cuenta corriente" : "Cuenta de ahorros"
}

// ——— Texto para compartir ———
function linea(c: Cobro): string {
  const n = normalizarUno(c)
  const ent = nombreEntidad(n)
  const v = mostrar(n)
  if (n.clase === "llave") return `• Llave Bre-B${n.entidad && n.entidad !== "breb" ? ` (${ent})` : ""}: ${v}`
  if (n.clase === "enlace") return `• Paga por ${ent}: ${v}`
  if (entidad(n.entidad).cel) return `• ${ent}: ${v}`
  const quien = [n.titular?.trim() && `a nombre de ${n.titular.trim()}`, n.doc?.trim() && `${n.doc_tipo || "CC"} ${fmtDoc(soloDig(n.doc))}`].filter(Boolean).join(", ")
  return `• ${ent} ${n.tipo === "corriente" ? "corriente" : "ahorros"}: ${v}${quien ? ` (${quien})` : ""}`
}
export type ModoCompartir = "principal" | "todas"
/** La principal (marcada o, si no hay, la primera). */
export const principalDe = (items: Cobro[]) => items.find((c) => c.principal) ?? items[0] ?? null
/** Texto para WhatsApp, el QR o copiar. `encabezado` reemplaza "Para pagarle a …:". */
export function cobroTexto(nombre: string, items: Cobro[], modo: ModoCompartir = "todas", encabezado?: string) {
  const sel = modo === "principal" ? [principalDe(items)].filter((c): c is Cobro => !!c) : items
  return [encabezado ?? `Para pagarle a ${nombre}:`, ...sel.map(linea)].join("\n")
}

// ——— Compatibilidad y orden ———
/** Completa un elemento (de la 5.4 o de la 5.5) con entidad, clase y llave, y rellena los campos que lee la 5.4. */
export function normalizarUno(raw: Cobro): Cobro {
  const c = { ...raw, detalle: String(raw.detalle ?? "") }
  let ent = c.entidad && BY_KEY.has(c.entidad) ? c.entidad : undefined
  if (!ent) ent = c.medio === "otro" || !c.medio ? (entidadPorNombre(c.banco) ?? "otro") : c.medio === "breb" ? "breb" : BY_KEY.has(c.medio) ? c.medio : (entidadPorNombre(c.banco) ?? "otro")
  if (c.entidad && !BY_KEY.has(c.entidad) && !c.banco) c.banco = c.entidad
  const E = entidad(ent)
  let clase: CobroClase = c.clase && E.clases.includes(c.clase) ? c.clase : c.medio === "breb" ? "llave" : E.clases.includes("cuenta") ? "cuenta" : E.clases[0]
  if (!E.clases.includes(clase)) clase = E.clases[0]
  const out: Cobro = { ...c, entidad: ent, clase }
  if (clase === "llave") {
    out.llave = c.llave ?? detectarLlave(c.detalle) ?? "alfanumerica"
    out.medio = "breb"
    delete out.tipo
  } else if (clase === "enlace") {
    out.medio = "otro"
    delete out.tipo
    delete out.llave
  } else {
    out.medio = MEDIOS_54.has(ent) && ent !== "breb" ? ent : "otro"
    delete out.llave
    if (E.cel) delete out.tipo
    else out.tipo = c.tipo === "corriente" ? "corriente" : "ahorros"
  }
  out.banco = ent === "otro" ? (c.banco?.trim() || "Otra entidad") : E.n
  return out
}

/**
 * Lee lo guardado (lista plana de la 5.4, de la 5.5 o basura) y lo deja en el formato de la 5.5: ids únicos,
 * cada elemento con su entidad, y exactamente una principal. Es idempotente: se usa al leer y al guardar.
 */
export function normalizarCobros(raw: unknown): Cobro[] {
  if (!Array.isArray(raw)) return []
  const seen = new Set<string>()
  const items = raw
    .filter((x): x is Cobro => !!x && typeof x === "object" && typeof (x as Cobro).detalle === "string" && !!(x as Cobro).detalle.trim())
    .map((x, i) => {
      let id = typeof x.id === "string" && x.id ? x.id : `cobro-${i}`
      while (seen.has(id)) id = `${id}-${i}`
      seen.add(id)
      return normalizarUno({ ...x, id })
    })
  const p = items.findIndex((c) => c.principal)
  return items.map((c, i) => {
    const o = { ...c }
    if (i === (p < 0 ? 0 : p)) o.principal = true
    else delete o.principal
    return o
  })
}

export type GrupoEntidad = { entidad: string; nombre: string; items: Cobro[] }
/** Agrupa por entidad en el orden en que aparece cada una ("otra entidad" se separa por nombre). */
export function agrupar(items: Cobro[]): GrupoEntidad[] {
  const out: GrupoEntidad[] = []
  for (const c of items) {
    const key = grupoKey(c)
    const g = out.find((x) => x.entidad === key)
    if (g) g.items.push(c)
    else out.push({ entidad: key, nombre: nombreEntidad(c), items: [c] })
  }
  return out
}
const grupoKey = (c: Cobro) => (c.entidad === "otro" || !c.entidad ? `otro:${norm(c.banco ?? "")}` : c.entidad)
export const entidadDeGrupo = (key: string) => (key.startsWith("otro:") ? "otro" : key)

/** Sube (-1) o baja (+1) un elemento dentro de su entidad. */
export function moverItem(items: Cobro[], id: string, dir: -1 | 1): Cobro[] {
  const groups = agrupar(items)
  const g = groups.find((x) => x.items.some((c) => c.id === id))
  if (!g) return items
  const i = g.items.findIndex((c) => c.id === id)
  const j = i + dir
  if (j < 0 || j >= g.items.length) return items
  const arr = [...g.items];[arr[i], arr[j]] = [arr[j], arr[i]]
  g.items = arr
  return groups.flatMap((x) => x.items)
}
/** Sube (-1) o baja (+1) una entidad completa. */
export function moverEntidad(items: Cobro[], key: string, dir: -1 | 1): Cobro[] {
  const groups = agrupar(items)
  const i = groups.findIndex((x) => x.entidad === key)
  const j = i + dir
  if (i < 0 || j < 0 || j >= groups.length) return items
  ;[groups[i], groups[j]] = [groups[j], groups[i]]
  return groups.flatMap((x) => x.items)
}
/** Marca un elemento como principal (y desmarca los demás). */
export const marcarPrincipal = (items: Cobro[], id: string): Cobro[] =>
  items.map((c) => { const o = { ...c }; if (c.id === id) o.principal = true; else delete o.principal; return o })
