// WhatsApp Cloud API: lógica pura (teléfonos de Colombia, parámetros de la plantilla y errores de Meta). Isomórfico.

/**
 * Número de celular en formato E.164 de Colombia, sin el "+": 57 + 10 dígitos que empiezan por 3.
 * Acepta "315 123 4567", "(315) 123-4567", "+57 315…", "57315…", "0057315…" y "03151234567". Devuelve null si no es un celular válido.
 */
export function normalizeCoPhone(input: string | null | undefined): string | null {
  let d = String(input ?? "").replace(/\D/g, "")
  if (d.startsWith("0057")) d = d.slice(4)
  else if (d.length === 12 && d.startsWith("57")) d = d.slice(2)
  else if (d.length === 11 && d.startsWith("0")) d = d.slice(1)
  return /^3\d{9}$/.test(d) ? `57${d}` : null
}

/** +57 315 123 4567 para mostrar. */
export const formatCoPhone = (e164: string) => e164.replace(/^57(\d{3})(\d{3})(\d{4})$/, "+57 $1 $2 $3")

/**
 * Texto válido para un parámetro de plantilla: Meta rechaza saltos de línea, tabulaciones y más de 4 espacios seguidos
 * (error 132018). Las líneas se unen con " · " y se recorta a `max` caracteres.
 */
export function waParam(s: string, max = 900) {
  const t = String(s ?? "")
    .split(/\r?\n/).map((x) => x.replace(/\t/g, " ").trim()).filter(Boolean).join(" · ")
    .replace(/ {4,}/g, "   ")
    .trim()
  return (t.length > max ? `${t.slice(0, max - 1).trimEnd()}…` : t) || "-"
}

// ── Datos de Mirai que pueden ir en una plantilla ─────────────────────────────────────────────────────────────

export const WA_VARS = [
  { k: "nombre", l: "Nombre de la persona", ej: "Alberto" },
  { k: "resumen", l: "Lista de avisos (en una línea)", ej: "Arriendo $1.700.000 vence mañana · Cuota banco $478.267 el 5 nov" },
  { k: "cantidad", l: "Cantidad de avisos", ej: "3" },
  { k: "titulo", l: "Título del aviso principal", ej: "Arriendo" },
  { k: "detalle", l: "Detalle del aviso principal", ej: "$1.700.000 · vence mañana" },
  { k: "monto", l: "Monto del aviso principal", ej: "$1.700.000" },
  { k: "fecha", l: "Fecha de hoy", ej: "lunes 2 de noviembre" },
  { k: "enlace", l: "Enlace a Mirai", ej: "https://mirai.engynex.com/inicio" },
] as const
export type WaVar = (typeof WA_VARS)[number]["k"]
/** Valores que Mirai puede poner en la plantilla. */
export type WaValues = Record<WaVar, string>
type Role = WaVar

const EMPTY: WaValues = { nombre: "", resumen: "", cantidad: "1", titulo: "", detalle: "", monto: "", fecha: "", enlace: "" }
const MONEY = /\$\s?[\d.]+(,\d+)?/

/** Valores de plantilla a partir de un texto libre (avisos sueltos, p. ej. automatizaciones): todo va como resumen. */
export const waValuesFromText = (text: string, extra: Partial<WaValues> = {}): WaValues => {
  const [titulo = "", ...rest] = String(text ?? "").split(/\r?\n/).filter((x) => x.trim())
  return { ...EMPTY, resumen: text, titulo, detalle: rest.join(" "), monto: String(text ?? "").match(MONEY)?.[0] ?? "", ...extra }
}

/** Casos en que Mirai envía WhatsApp. Cada uno puede usar su propia plantilla o la plantilla por defecto. */
export const WA_CASES = [
  { k: "resumen", n: "Resumen diario de avisos", d: "El resumen de pagos, cobros y alertas que cada persona programó en Ajustes › Alertas.", icon: "list-checks" },
  { k: "pagos", n: "Recordatorio de pago", d: "Cuando el resumen solo trae pagos por vencer o vencidos (gastos fijos, cuotas, aportes).", icon: "receipt" },
  { k: "cobros", n: "Cuota por cobrar", d: "Cuando el resumen solo trae cuotas que le deben pagar a la persona.", icon: "hand-coins" },
  { k: "presupuesto", n: "Alerta de presupuesto", d: "Cuando el resumen solo trae categorías que llegaron al límite del presupuesto.", icon: "chart-pie" },
  { k: "hormiga", n: "Gastos hormiga", d: "Cuando el resumen solo trae el aviso de gastos hormiga.", icon: "coffee" },
  { k: "inversiones", n: "Inversión por vencer", d: "Cuando el resumen solo trae CDT o inversiones por vencer.", icon: "trending-up" },
  { k: "metas", n: "Metas", d: "Cuando el resumen solo trae metas cerca de su fecha.", icon: "target" },
  { k: "automatizacion", n: "Aviso de automatización", d: "Mensajes de las automatizaciones del hogar que avisan por todos los canales.", icon: "workflow" },
  { k: "prueba", n: "Mensaje de prueba", d: "“Enviarme una prueba” en Ajustes › Alertas y “Enviar prueba” de la consola.", icon: "send" },
] as const
export type WaCase = (typeof WA_CASES)[number]["k"]
export const WA_CASE_KEYS = WA_CASES.map((c) => c.k) as WaCase[]

/** Valores de ejemplo de un caso (vista previa y "Probar plantilla"). */
export function sampleValues(caso: WaCase, base = "https://mirai.engynex.com"): WaValues {
  const ej = Object.fromEntries(WA_VARS.map((v) => [v.k, v.ej])) as WaValues
  const by: Partial<Record<WaCase, Partial<WaValues>>> = {
    pagos: { titulo: "Arriendo", detalle: "$1.700.000 · vence mañana", monto: "$1.700.000", cantidad: "1", resumen: "Arriendo $1.700.000 vence mañana", enlace: `${base}/gastos-fijos` },
    cobros: { titulo: "Préstamo a Juan", detalle: "Cuota de $200.000 el 5 nov", monto: "$200.000", cantidad: "1", resumen: "Juan te paga $200.000 el 5 nov", enlace: `${base}/prestamos` },
    presupuesto: { titulo: "Mercado", detalle: "Vas en el 90 % del presupuesto", monto: "$900.000", cantidad: "1", resumen: "Mercado: vas en el 90 % del presupuesto", enlace: `${base}/presupuesto` },
    hormiga: { titulo: "Gastos hormiga", detalle: "Vas en $180.000 de $200.000", monto: "$180.000", cantidad: "1", resumen: "Gastos hormiga: $180.000 de $200.000", enlace: `${base}/gastos` },
    inversiones: { titulo: "CDT Bancolombia", detalle: "Vence el 10 nov", monto: "$5.000.000", cantidad: "1", resumen: "CDT Bancolombia $5.000.000 vence el 10 nov", enlace: `${base}/inversiones` },
    metas: { titulo: "Viaje a Cartagena", detalle: "Faltan 15 días y vas en el 70 %", monto: "$2.100.000", cantidad: "1", resumen: "Viaje a Cartagena: vas en el 70 %", enlace: `${base}/metas` },
    automatizacion: { titulo: "Gasto grande registrado", detalle: "Se registró un gasto de $850.000 en Tecnología", monto: "$850.000", cantidad: "1", resumen: "Gasto grande registrado: $850.000 en Tecnología", enlace: `${base}/automatizaciones` },
    prueba: { titulo: "Mensaje de prueba", detalle: "Así te llegarán los avisos", monto: "", cantidad: "0", resumen: "Este es un mensaje de prueba de Mirai. Así te llegará el resumen de tus pagos y cobros", enlace: `${base}/inicio` },
  }
  return { ...ej, enlace: `${base}/inicio`, ...by[caso] }
}

// ── Estructura de las plantillas de Meta ─────────────────────────────────────────────────────────────────────

export type MetaButton = { type: string; text?: string; url?: string; phone_number?: string; example?: string[] | string }
export type MetaComponent = {
  type: string; format?: string; text?: string; buttons?: MetaButton[]
  example?: { header_text?: string[]; header_handle?: string[]; body_text?: string[][]; body_text_named_params?: { param_name: string; example: string }[]; header_text_named_params?: { param_name: string; example: string }[] }
}
export type MetaTemplate = {
  id?: string; name: string; language: string; status?: string; category?: string; parameter_format?: string; components?: MetaComponent[]
  rejected_reason?: string; quality_score?: { score?: string }
}

/** Plantilla de respaldo cuando no hay ID de la cuenta: un cuerpo con un solo parámetro (el resumen). */
export const fallbackTemplate = (name: string, lang: string): MetaTemplate => ({ name, language: lang, status: "APPROVED", parameter_format: "POSITIONAL", components: [{ type: "BODY", text: "{{1}}" }] })

/** Cómo se llena un espacio de la plantilla: con un dato de Mirai o con un texto fijo. */
export type WaMap = { src: WaVar } | { src: "fijo"; text: string }

/** Espacio que hay que llenar al enviar (parámetro del encabezado, del cuerpo o de un botón). */
export type Slot = {
  key: string
  comp: "header" | "body" | "button"
  kind: "text" | "image" | "video" | "document" | "location" | "url" | "quick_reply" | "copy_code"
  /** Nombre del parámetro ("1" o "nombre") o índice del botón. */
  name: string
  label: string
  example?: string
  index?: number
}

const upper = (s?: string) => String(s ?? "").toUpperCase()
const VAR = /\{\{\s*([\w]+)\s*\}\}/g

/** Parámetros ({{1}} o {{nombre}}) de un texto, sin repetir, en orden ({{n}} ordenados por número). */
function varsOf(text: string, named: boolean) {
  const out: { name: string; before: string }[] = []
  for (const m of String(text ?? "").matchAll(VAR)) if (!out.some((x) => x.name === m[1])) out.push({ name: m[1], before: text.slice(0, m.index) })
  if (!named) out.sort((a, b) => +a.name - +b.name)
  return out
}

export const isNamed = (t: MetaTemplate) => upper(t.parameter_format) === "NAMED"
const comp = (t: MetaTemplate, type: string) => (t.components ?? []).find((c) => upper(c.type) === type)
const bodyText = (t: MetaTemplate) => comp(t, "BODY")?.text ?? ""

/** Todo lo que hay que mandar al enviar esta plantilla. */
export function templateSlots(t: MetaTemplate): Slot[] {
  const named = isNamed(t)
  const out: Slot[] = []
  const head = comp(t, "HEADER")
  const hf = upper(head?.format || (head ? "TEXT" : ""))
  if (head && hf === "TEXT") {
    const ex = head.example?.header_text_named_params ?? []
    varsOf(head.text ?? "", named).forEach((v, i) => out.push({ key: `header.${v.name}`, comp: "header", kind: "text", name: v.name, label: `Encabezado {{${v.name}}}`, example: ex.find((x) => x.param_name === v.name)?.example ?? head.example?.header_text?.[i] }))
  } else if (head && ["IMAGE", "VIDEO", "DOCUMENT", "LOCATION"].includes(hf)) {
    const kind = hf.toLowerCase() as Slot["kind"]
    out.push({ key: "header.media", comp: "header", kind, name: "media", label: { image: "Imagen del encabezado", video: "Video del encabezado", document: "Documento del encabezado", location: "Ubicación del encabezado" }[kind as "image"] ?? "Encabezado", example: head.example?.header_handle?.[0] })
  }
  const body = comp(t, "BODY")
  if (body) {
    const exNamed = body.example?.body_text_named_params ?? []
    varsOf(body.text ?? "", named).forEach((v, i) => out.push({ key: `body.${v.name}`, comp: "body", kind: "text", name: v.name, label: `Cuerpo {{${v.name}}}`, example: exNamed.find((x) => x.param_name === v.name)?.example ?? body.example?.body_text?.[0]?.[i] }))
  }
  ;(comp(t, "BUTTONS")?.buttons ?? []).forEach((b, i) => {
    const bt = upper(b.type)
    if (bt === "URL" && /\{\{\s*\w+\s*\}\}/.test(b.url ?? "")) out.push({ key: `button.${i}`, comp: "button", kind: "url", name: String(i), index: i, label: `Botón “${b.text ?? i + 1}” (final del enlace)`, example: Array.isArray(b.example) ? b.example[0] : b.example })
    else if (bt === "COPY_CODE") out.push({ key: `button.${i}`, comp: "button", kind: "copy_code", name: String(i), index: i, label: `Botón “${b.text ?? "Copiar código"}” (código)`, example: Array.isArray(b.example) ? b.example[0] : b.example })
    else if (bt === "QUICK_REPLY") out.push({ key: `button.${i}`, comp: "button", kind: "quick_reply", name: String(i), index: i, label: `Botón “${b.text ?? i + 1}” (respuesta rápida)` })
  })
  return out
}

/** Rol de un parámetro según su nombre ({{nombre}}) o el texto que lo antecede ("Hola {{1}}"). */
export function roleOf(name: string, before = ""): Role | null {
  const n = name.toLowerCase()
  if (!/^\d+$/.test(n)) {
    if (/nombre|name|usuario|cliente/.test(n)) return "nombre"
    if (/monto|valor|amount|precio/.test(n)) return "monto"
    if (/cant|num|total|count|avisos?$/.test(n)) return "cantidad"
    if (/fecha|date|dia|día|hoy/.test(n)) return "fecha"
    if (/url|enlace|link/.test(n)) return "enlace"
    if (/titulo|título|title|concepto/.test(n)) return "titulo"
    return "resumen"
  }
  const b = before.toLowerCase().slice(-30)
  if (/(hola|hi|hello|querid[oa]|estimad[oa]|buen[oa]s? (d[ií]as|tardes|noches))[\s,]*$/.test(b)) return "nombre"
  if (/(tienes|hay|total|cantidad|son)[\s:]*$/.test(b)) return "cantidad"
  if (/(\$|monto|valor|por)[\s:]*$/.test(b)) return "monto"
  if (/(fecha|hoy|del|el d[ií]a)[\s:,]*$/.test(b)) return "fecha"
  if (/(https?:\/\/\S*|enlace|link|aqu[ií])[\s:]*$/.test(b)) return "enlace"
  return null
}

/** Orden de respaldo cuando el texto no dice qué va en cada {{n}}. */
const BY_COUNT: Record<number, Role[]> = {
  1: ["resumen"], 2: ["nombre", "resumen"], 3: ["nombre", "cantidad", "resumen"], 4: ["nombre", "fecha", "cantidad", "resumen"], 5: ["nombre", "fecha", "cantidad", "resumen", "enlace"],
}

/** Asignación automática de cada espacio a un dato de Mirai (lo que no se ajuste a mano en la consola). */
export function autoMap(t: MetaTemplate): Record<string, WaMap> {
  const named = isNamed(t)
  const out: Record<string, WaMap> = {}
  const head = comp(t, "HEADER")
  if (head && upper(head.format || "TEXT") === "TEXT") for (const v of varsOf(head.text ?? "", named)) out[`header.${v.name}`] = { src: roleOf(v.name, v.before) ?? "nombre" }
  const raw = varsOf(bodyText(t), named).map((v) => ({ name: v.name, role: roleOf(v.name, v.before) }))
  // Lo que el texto no aclara se llena con el orden de respaldo, sin repetir roles ya usados.
  const fallback = (BY_COUNT[raw.length] ?? BY_COUNT[5]).filter((r) => !raw.some((x) => x.role === r))
  for (const p of raw) out[`body.${p.name}`] = { src: p.role ?? fallback.shift() ?? "resumen" }
  ;(comp(t, "BUTTONS")?.buttons ?? []).forEach((b, i) => {
    const bt = upper(b.type)
    if (bt === "URL" && /\{\{\s*\w+\s*\}\}/.test(b.url ?? "")) out[`button.${i}`] = { src: "enlace" }
    else if (bt === "COPY_CODE") out[`button.${i}`] = { src: "fijo", text: "MIRAI" }
    else if (bt === "QUICK_REPLY") out[`button.${i}`] = { src: "fijo", text: b.text ?? `boton_${i}` }
  })
  return out
}

/** Elige la plantilla aprobada en el idioma pedido (o la primera aprobada) de la lista de Meta. */
export function pickTemplate(list: MetaTemplate[], name: string, lang?: string) {
  const ok = list.filter((t) => t.name === name && (!t.status || t.status.toUpperCase() === "APPROVED"))
  return ok.find((t) => t.language === lang) ?? ok.find((t) => t.language === "es_CO") ?? ok.find((t) => t.language?.startsWith("es")) ?? ok[0] ?? null
}

/** Final del enlace para un botón con URL variable: quita la parte fija de la plantilla (o el dominio). */
export function urlSuffix(templateUrl: string, value: string) {
  const base = templateUrl.replace(/\{\{\s*\w+\s*\}\}.*$/, "")
  let v = String(value ?? "").trim()
  if (base && v.startsWith(base)) v = v.slice(base.length)
  else if (/^https?:\/\//.test(v)) v = v.replace(/^https?:\/\/[^/]+\/?/, "")
  return v.replace(/\s+/g, "") || "inicio"
}

export type BuildOpts = {
  /** Asignación guardada en la consola (lo que falte se asigna solo). */
  map?: Record<string, WaMap>
  /** Imagen, video o documento del encabezado: enlace público (https) o id de un medio subido a Meta. */
  media?: { link?: string; id?: string; filename?: string }
}

/** Valor que se envía en cada espacio (para la vista previa y para armar el mensaje). */
export type ParamPreview = { key: string; label: string; value: string; src: string }

/**
 * Cuerpo del POST /{phoneId}/messages con TODOS los componentes que pide la plantilla: encabezado (texto o medio),
 * cuerpo (posicional o con nombre) y botones con parámetros (URL variable, respuesta rápida, copiar código).
 * Los botones fijos (URL estática, llamar) no llevan parámetros. Lanza un error legible si falta algo.
 */
export function buildTemplateMessage(to: string, t: MetaTemplate, v: WaValues, o: BuildOpts = {}) {
  const named = isNamed(t)
  const slots = templateSlots(t)
  const auto = autoMap(t)
  const pick = (key: string): WaMap => o.map?.[key] ?? auto[key] ?? { src: "resumen" }
  const raw = (m: WaMap) => (m.src === "fijo" ? m.text : v[m.src] ?? "")
  const srcOf = (m: WaMap) => (m.src === "fijo" ? "texto fijo" : WA_VARS.find((x) => x.k === m.src)?.l ?? m.src)
  const preview: ParamPreview[] = []
  const components: Record<string, unknown>[] = []

  // Encabezado: texto (máx. 60 caracteres en total) o medio.
  const hs = slots.filter((s) => s.comp === "header")
  if (hs.length) {
    const media = hs.find((s) => s.key === "header.media")
    if (media) {
      if (media.kind === "location") throw new Error("La plantilla tiene una ubicación en el encabezado: Mirai no envía ubicaciones. Usa otra plantilla.")
      const ref = o.media?.id ? { id: o.media.id } : o.media?.link ? { link: o.media.link } : null
      if (!ref) throw new Error(`La plantilla "${t.name}" tiene ${media.label.toLowerCase()} y no hay ninguno configurado. Escoge uno en consola › WhatsApp.`)
      if ("link" in ref && !/^https:\/\//.test(ref.link!)) throw new Error("El enlace del encabezado debe ser público y empezar por https:// (Meta no puede leer localhost).")
      components.push({ type: "header", parameters: [{ type: media.kind, [media.kind]: media.kind === "document" ? { ...ref, filename: o.media?.filename || "Mirai.pdf" } : ref }] })
      preview.push({ key: media.key, label: media.label, value: o.media?.link ?? `media ${o.media?.id}`, src: "imagen" })
    } else {
      const fixed = (comp(t, "HEADER")?.text ?? "").replace(VAR, "").length
      const max = Math.max(5, Math.floor((60 - fixed) / hs.length))
      components.push({ type: "header", parameters: hs.map((s) => { const m = pick(s.key); const text = waParam(raw(m), max); preview.push({ key: s.key, label: s.label, value: text, src: srcOf(m) }); return { type: "text", text, ...(named ? { parameter_name: s.name } : {}) } }) })
    }
  }

  // Cuerpo: el texto final no puede pasar de 1024 caracteres (error 132005).
  const bs = slots.filter((s) => s.comp === "body")
  if (bs.length) {
    const fixed = bodyText(t).replace(VAR, "").length
    const max = Math.max(20, Math.floor((1024 - fixed) / bs.length))
    components.push({ type: "body", parameters: bs.map((s) => { const m = pick(s.key); const text = waParam(raw(m), max); preview.push({ key: s.key, label: s.label, value: text, src: srcOf(m) }); return { type: "text", text, ...(named ? { parameter_name: s.name } : {}) } }) })
  }

  // Botones con parámetros; los demás (URL fija, llamar) no se mandan.
  const buttons = comp(t, "BUTTONS")?.buttons ?? []
  for (const s of slots.filter((x) => x.comp === "button")) {
    const m = pick(s.key)
    const b = buttons[s.index!]
    if (s.kind === "url") {
      const text = urlSuffix(b?.url ?? "", raw(m))
      components.push({ type: "button", sub_type: "url", index: String(s.index), parameters: [{ type: "text", text }] })
      preview.push({ key: s.key, label: s.label, value: text, src: srcOf(m) })
    } else if (s.kind === "copy_code") {
      const code = waParam(raw(m), 15).replace(/\s+/g, "") || "MIRAI"
      components.push({ type: "button", sub_type: "copy_code", index: String(s.index), parameters: [{ type: "coupon_code", coupon_code: code }] })
      preview.push({ key: s.key, label: s.label, value: code, src: srcOf(m) })
    } else if (s.kind === "quick_reply") {
      const payload = waParam(raw(m), 128)
      components.push({ type: "button", sub_type: "quick_reply", index: String(s.index), parameters: [{ type: "payload", payload }] })
      preview.push({ key: s.key, label: s.label, value: payload, src: srcOf(m) })
    }
  }
  const message = { messaging_product: "whatsapp", recipient_type: "individual", to, type: "template", template: { name: t.name, language: { code: t.language }, ...(components.length ? { components } : {}) } }
  return { message, preview }
}

// ── Ajustes de WhatsApp en la integración global (config) ────────────────────────────────────────────────────

/** Plantilla y asignación de un caso. Sin `template` usa la plantilla por defecto. */
export type WaCaseCfg = { template?: string; lang?: string; map?: Record<string, WaMap>; headerImage?: string }
export type WaSettings = {
  /** Plantilla por defecto (config.template) y su idioma (config.lang). Vacía = texto libre (solo dentro de 24 h). */
  template: string
  lang: string
  /** Asignación de la plantilla por defecto. */
  map: Record<string, WaMap>
  /** Imagen por defecto de los encabezados con imagen (URL pública https). Vacía = la imagen de marca de Mirai. */
  headerImage: string
  /** Dirección de Mirai para los enlaces y los botones con URL variable (vacía = la del sitio). */
  enlaceBase: string
  casos: Partial<Record<WaCase, WaCaseCfg>>
}

/** Ajustes de WhatsApp a partir de la config guardada (acepta configuraciones viejas sin `wa`). */
export function waSettings(config: Record<string, unknown> | null | undefined): WaSettings {
  const c = config ?? {}
  const wa = (c.wa ?? {}) as Partial<WaSettings>
  return {
    template: String(c.template ?? "").trim(), lang: String(c.lang || "es_CO").trim(),
    map: wa.map ?? {}, headerImage: String(wa.headerImage ?? ""), enlaceBase: String(wa.enlaceBase ?? ""), casos: wa.casos ?? {},
  }
}

/**
 * Plantillas de ejemplo que Meta crea al configurar la cuenta ("Integration Test", "Hello World"): no llevan variables,
 * así que nunca muestran el resumen de Mirai. La consola avisa si quedan como plantilla por defecto o de un caso.
 */
export const esPlantillaDeMeta = (name: string | null | undefined) => /^(hello_world|3p_direct_integration_test_template|sample_)/i.test(String(name ?? "").trim())

/**
 * Plantilla de respaldo cuando la del caso no está aprobada: la por defecto, luego una propia aprobada con variable en el
 * cuerpo (primero en español) y, al final, la de ejemplo de Meta.
 */
export function plantillaDeRespaldo(list: MetaTemplate[], defaultName: string, skip: string): MetaTemplate | null {
  const ok = list.filter((t) => String(t.status ?? "").toUpperCase() === "APPROVED" && t.name !== skip)
  const conVariable = (t: MetaTemplate) => !esPlantillaDeMeta(t.name) && templateSlots(t).some((x) => x.comp === "body")
  return [
    defaultName && defaultName !== skip ? ok.find((t) => t.name === defaultName) : undefined,
    ok.find((t) => conVariable(t) && String(t.language ?? "").startsWith("es")),
    ok.find(conVariable),
    ok.find((t) => esPlantillaDeMeta(t.name)),
    ok[0],
  ].find(Boolean) ?? null
}

/** Plantilla, idioma, asignación e imagen que usa un caso. */
export function caseConfig(s: WaSettings, caso: WaCase = "resumen") {
  const c = s.casos[caso]
  const own = !!c?.template?.trim()
  return {
    template: own ? c!.template!.trim() : s.template,
    lang: (own ? c!.lang : "") || s.lang || "es_CO",
    map: own ? c!.map ?? {} : { ...s.map },
    headerImage: c?.headerImage || s.headerImage || "",
    propia: own,
  }
}

/** Caso según los avisos del resumen: si todos son de la misma clase (pagos, presupuesto…) se usa ese caso. */
export function caseOfDigest(kinds: string[]): WaCase {
  const set = [...new Set(kinds)]
  return set.length === 1 && (WA_CASE_KEYS as string[]).includes(set[0]) ? (set[0] as WaCase) : "resumen"
}

/** Cambia el dominio del enlace por la dirección configurada (si la hay). */
export const withBase = (enlace: string, base: string) => (base && /^https?:\/\//.test(enlace) ? enlace.replace(/^https?:\/\/[^/]+/, base.replace(/\/+$/, "")) : enlace)

/** Mensaje claro en español para los errores más comunes de la API de WhatsApp. */
export function waErrorMsg(err: { code?: number; message?: string; error_data?: { details?: string }; error_subcode?: number; error_user_title?: string; error_user_msg?: string } | null | undefined) {
  const code = Number(err?.code)
  const det = err?.error_user_msg ? `${err.error_user_title ? `${err.error_user_title}: ` : ""}${err.error_user_msg}` : err?.error_data?.details || err?.message || "error desconocido"
  const known: Record<number, string> = {
    190: "El token de acceso venció o no es válido. Genera uno permanente (usuario del sistema) en Meta Business y guárdalo en la consola.",
    10: "El token no tiene permiso para enviar mensajes (whatsapp_business_messaging) o la cuenta no está asignada al usuario del sistema.",
    200: "El token no tiene permiso sobre esta cuenta de WhatsApp Business. Asígnala al usuario del sistema en Meta Business.",
    131030: "Ese número no está en la lista de destinatarios permitidos del número de prueba de Meta. Agrégalo en WhatsApp › Configuración de la API o usa un número de producción.",
    131026: "WhatsApp no pudo entregar el mensaje: el número no tiene WhatsApp o no aceptó las condiciones más recientes.",
    131047: "Pasaron más de 24 horas desde el último mensaje de esa persona: solo se puede enviar con una plantilla aprobada.",
    131056: "Demasiados mensajes seguidos al mismo número. Espera un momento.",
    131042: "Hay un problema con el método de pago de la cuenta de WhatsApp Business en Meta.",
    132000: "La cantidad de parámetros no coincide con la plantilla aprobada. Guarda el ID de la cuenta de WhatsApp Business para que Mirai lea su estructura.",
    132007: "El texto de un parámetro no cumple las políticas de Meta (formato o contenido).",
    132001: "La plantilla no existe en ese idioma o aún no está aprobada. Revisa el nombre y el idioma (por ejemplo es_CO o es).",
    132005: "El texto con los parámetros quedó demasiado largo para la plantilla.",
    132012: "El formato de los parámetros no coincide con la plantilla: falta un componente (por ejemplo la imagen del encabezado) o un parámetro no es del tipo que pide. Revisa la plantilla en consola › WhatsApp.",
    132015: "La plantilla está en pausa por baja calidad.",
    132016: "La plantilla fue desactivada.",
    132018: "Un parámetro tiene saltos de línea o demasiados espacios.",
    133010: "El número de WhatsApp de Mirai no está registrado en la Cloud API.",
    368: "Meta bloqueó temporalmente la cuenta por políticas.",
  }
  if (known[code]) return `${known[code]} (código ${code})`
  if (code === 100 && /does not exist|nonexisting|Unsupported post request/i.test(det)) return `El "ID del número de teléfono" no es válido: debe ser el Phone number ID que aparece en WhatsApp › Configuración de la API (no el ID de la app, de la empresa ni del usuario del sistema). (código 100)`
  return `${det}${code ? ` (código ${code})` : ""}`
}
