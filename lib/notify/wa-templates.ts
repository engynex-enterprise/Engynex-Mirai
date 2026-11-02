// Plantillas de WhatsApp creadas desde Mirai: borrador, validaciones según las reglas de Meta y el cuerpo que se
// envía a POST /{WABA_ID}/message_templates. Puro e isomórfico (lo usan la consola y el servidor).
import type { MetaTemplate } from "./whatsapp"

export const WA_LANGS = [
  { value: "es_CO", label: "Español (Colombia) · es_CO" },
  { value: "es", label: "Español · es" },
  { value: "es_MX", label: "Español (México) · es_MX" },
  { value: "es_ES", label: "Español (España) · es_ES" },
  { value: "es_AR", label: "Español (Argentina) · es_AR" },
  { value: "en_US", label: "Inglés (EE. UU.) · en_US" },
  { value: "en", label: "Inglés · en" },
  { value: "pt_BR", label: "Portugués (Brasil) · pt_BR" },
]
export const WA_CATEGORIES = [
  { value: "UTILITY", label: "Utilidad", desc: "Avisos de algo que la persona pidió o programó (recordatorios de pago, alertas). Más barata y se aprueba más fácil." },
  { value: "MARKETING", label: "Marketing", desc: "Promociones, novedades o invitaciones. Más cara y Meta la revisa con más cuidado." },
] as const

export type DraftButton =
  | { type: "url"; text: string; url: string; example?: string }
  | { type: "quick_reply"; text: string }
  | { type: "phone"; text: string; phone: string }

export type DraftHeader = { type: "none" } | { type: "text"; text: string; example?: string } | { type: "image"; url: string }

export type TemplateDraft = {
  name: string
  language: string
  category: "UTILITY" | "MARKETING"
  header: DraftHeader
  body: string
  /** Un ejemplo por cada {{n}} del cuerpo, en orden. */
  examples: string[]
  footer: string
  buttons: DraftButton[]
}

export const emptyDraft = (lang = "es_CO"): TemplateDraft => ({
  name: "", language: lang, category: "UTILITY", header: { type: "image", url: "" },
  body: "Hola {{1}}, tienes un recordatorio de Mirai: {{2}}. Revisa el detalle en la app.", examples: ["Alberto", "Arriendo $1.700.000 vence mañana"],
  footer: "Mirai · Tu futuro financiero", buttons: [{ type: "url", text: "Abrir Mirai", url: "https://mirai.engynex.com/inicio" }],
})

const VAR = /\{\{\s*([^}]*?)\s*\}\}/g
const EMOJI = /\p{Extended_Pictographic}/u
const badParam = (s: string) => /[\n\t]| {5,}/.test(s)

/** Números de las variables {{n}} de un texto, en orden de aparición (con repetidas). */
export const varNums = (text: string) => [...String(text ?? "").matchAll(VAR)].map((m) => m[1])
/** Cantidad de variables distintas del cuerpo ({{1}}…{{n}}). */
export const bodyVarCount = (text: string) => new Set(varNums(text).filter((x) => /^\d+$/.test(x))).size
/** Final variable de un botón de enlace: "https://x.co/{{1}}" → true. */
export const isDynamicUrl = (url: string) => /\{\{\s*1\s*\}\}$/.test(String(url ?? "").trim())

export type DraftCheck = { errors: string[]; warnings: string[] }

/** Valida el borrador con las reglas de Meta. Mensajes en español. */
export function validateDraft(d: TemplateDraft, o: { editing?: boolean } = {}): DraftCheck {
  const errors: string[] = [], warnings: string[] = []
  const name = d.name.trim()
  if (!o.editing) {
    if (!name) errors.push("Escribe el nombre de la plantilla.")
    else if (!/^[a-z0-9_]+$/.test(name)) errors.push("El nombre solo puede tener minúsculas sin tildes, números y guiones bajos (por ejemplo mirai_pago_proximo).")
    else if (name.length > 512) errors.push("El nombre es demasiado largo (máximo 512 caracteres).")
    if (!WA_LANGS.some((l) => l.value === d.language)) errors.push("Escoge un idioma de la lista.")
  }
  if (!WA_CATEGORIES.some((c) => c.value === d.category)) errors.push("Escoge la categoría: Utilidad o Marketing.")

  // Encabezado
  if (d.header.type === "text") {
    const t = d.header.text.trim()
    const vars = varNums(t)
    if (!t) errors.push("Escribe el texto del encabezado o escoge “Sin encabezado”.")
    if (t.length > 60) errors.push(`El encabezado tiene ${t.length} caracteres: máximo 60.`)
    if (/\n/.test(t)) errors.push("El encabezado no puede tener saltos de línea.")
    if (EMOJI.test(t) || /[*_~`]/.test(t)) errors.push("El encabezado no puede tener emojis ni formato (*, _, ~).")
    if (vars.length > 1) errors.push("El encabezado admite una sola variable: {{1}}.")
    if (vars.length === 1 && vars[0] !== "1") errors.push("La variable del encabezado debe ser {{1}}.")
    if (vars.length === 1 && !d.header.example?.trim()) errors.push("Escribe un ejemplo para la variable del encabezado.")
    if (vars.length === 1 && d.header.example && badParam(d.header.example)) errors.push("El ejemplo del encabezado no puede tener saltos de línea, tabulaciones ni muchos espacios seguidos.")
  } else if (d.header.type === "image" && !/^https:\/\//.test(d.header.url.trim())) {
    errors.push("Sube o escoge la imagen del encabezado (JPG o PNG de hasta 5 MB).")
  }

  // Cuerpo
  const body = d.body.trim()
  const vars = varNums(body)
  if (!body) errors.push("Escribe el texto del mensaje.")
  if (body.length > 1024) errors.push(`El mensaje tiene ${body.length} caracteres: máximo 1.024.`)
  if (vars.some((v) => !/^\d+$/.test(v))) errors.push("Las variables se escriben con números: {{1}}, {{2}}, {{3}}…")
  const nums = [...new Set(vars.filter((v) => /^\d+$/.test(v)).map(Number))].sort((a, b) => a - b)
  if (nums.some((n, i) => n !== i + 1)) errors.push(`Las variables deben ir seguidas desde {{1}}: ${nums.map((n) => `{{${n}}}`).join(", ")} no es válido.`)
  if (/^\{\{/.test(body)) errors.push("El mensaje no puede empezar con una variable: escribe algo antes (por ejemplo “Hola {{1}}”).")
  if (/\}\}$/.test(body)) errors.push("El mensaje no puede terminar con una variable: escribe algo después (por ejemplo un punto y una frase).")
  if (/\}\}\s*\{\{/.test(body)) errors.push("Dos variables no pueden ir pegadas: escribe texto entre ellas.")
  if (/\n{3,}/.test(body)) warnings.push("Hay más de una línea en blanco seguida; Meta podría rechazarla.")
  const words = body.replace(VAR, " ").split(/\s+/).filter(Boolean).length
  if (nums.length && words < nums.length * 2 + 1) errors.push("Hay demasiadas variables para lo corto del mensaje: agrega más texto fijo.")
  for (let i = 0; i < nums.length; i++) {
    const ex = (d.examples[i] ?? "").trim()
    if (!ex) errors.push(`Escribe un ejemplo para {{${i + 1}}} (Meta lo pide para revisar la plantilla).`)
    else if (badParam(ex)) errors.push(`El ejemplo de {{${i + 1}}} no puede tener saltos de línea, tabulaciones ni muchos espacios seguidos.`)
  }

  // Pie
  const footer = d.footer.trim()
  if (footer.length > 60) errors.push(`El pie tiene ${footer.length} caracteres: máximo 60.`)
  if (varNums(footer).length) errors.push("El pie no puede tener variables.")

  // Botones
  const b = d.buttons
  if (b.length > 10) errors.push("Máximo 10 botones.")
  if (b.filter((x) => x.type === "url").length > 2) errors.push("Máximo 2 botones de enlace.")
  if (b.filter((x) => x.type === "phone").length > 1) errors.push("Máximo 1 botón para llamar.")
  b.forEach((x, i) => {
    const n = `Botón ${i + 1}`
    if (!x.text.trim()) errors.push(`${n}: escribe el texto del botón.`)
    if (x.text.trim().length > 25) errors.push(`${n}: el texto tiene ${x.text.trim().length} caracteres (máximo 25).`)
    if (x.type === "url") {
      const u = x.url.trim()
      if (!/^https?:\/\/[^\s/]+\.[^\s]+/.test(u)) errors.push(`${n}: escribe un enlace completo que empiece por https://`)
      if (u.length > 2000) errors.push(`${n}: el enlace es demasiado largo (máximo 2.000 caracteres).`)
      const vs = varNums(u)
      if (vs.length > 1 || (vs.length === 1 && !isDynamicUrl(u))) errors.push(`${n}: el enlace admite una sola variable, {{1}}, y debe ir al final.`)
      if (isDynamicUrl(u) && !x.example?.trim()) errors.push(`${n}: escribe un ejemplo del final del enlace (por ejemplo “inicio”).`)
    }
    if (x.type === "phone" && !/^\+?\d{8,15}$/.test(x.phone.replace(/[\s()-]/g, ""))) errors.push(`${n}: escribe el teléfono con el indicativo del país (por ejemplo +57 601 123 4567).`)
  })
  const kinds = b.map((x) => (x.type === "quick_reply" ? "q" : "c"))
  if (kinds.join("").replace(/q+/, "Q").replace(/c+/, "C").length > 2) warnings.push("Las respuestas rápidas se agruparán antes de los botones de enlace o llamada, como pide Meta.")
  return { errors, warnings }
}

/** Teléfono para Meta: +57… sin espacios (agrega +57 si es un número colombiano sin indicativo). */
const phoneE164 = (p: string) => { const d = p.replace(/[^\d+]/g, ""); return d.startsWith("+") ? d : d.length === 10 ? `+57${d}` : `+${d}` }

/** Componentes para Meta. `headerHandle` es el identificador del ejemplo de imagen (Resumable Upload API). */
export function draftComponents(d: TemplateDraft, headerHandle?: string) {
  const components: Record<string, unknown>[] = []
  if (d.header.type === "text") {
    const t = d.header.text.trim()
    components.push({ type: "HEADER", format: "TEXT", text: t, ...(varNums(t).length ? { example: { header_text: [d.header.example!.trim()] } } : {}) })
  } else if (d.header.type === "image") {
    if (!headerHandle) throw new Error("Falta subir la imagen del encabezado a Meta.")
    components.push({ type: "HEADER", format: "IMAGE", example: { header_handle: [headerHandle] } })
  }
  const body = d.body.trim()
  const n = bodyVarCount(body)
  components.push({ type: "BODY", text: body, ...(n ? { example: { body_text: [d.examples.slice(0, n).map((x) => x.trim())] } } : {}) })
  if (d.footer.trim()) components.push({ type: "FOOTER", text: d.footer.trim() })
  // Meta pide las respuestas rápidas agrupadas: primero ellas y luego enlaces y llamadas.
  const ordered = [...d.buttons.filter((x) => x.type === "quick_reply"), ...d.buttons.filter((x) => x.type !== "quick_reply")]
  if (ordered.length) components.push({ type: "BUTTONS", buttons: ordered.map((x) => {
    if (x.type === "quick_reply") return { type: "QUICK_REPLY", text: x.text.trim() }
    if (x.type === "phone") return { type: "PHONE_NUMBER", text: x.text.trim(), phone_number: phoneE164(x.phone) }
    const url = x.url.trim()
    return { type: "URL", text: x.text.trim(), url, ...(isDynamicUrl(url) ? { example: [url.replace(/\{\{\s*1\s*\}\}$/, x.example!.trim().replace(/^\/+/, ""))] } : {}) }
  }) })
  return components
}

/** Cuerpo de POST /{WABA_ID}/message_templates (crear). */
export const draftToMeta = (d: TemplateDraft, headerHandle?: string) => ({
  name: d.name.trim(), language: d.language, category: d.category, parameter_format: "POSITIONAL", components: draftComponents(d, headerHandle),
})

/** Borrador a partir de una plantilla de Meta (para editarla). La imagen queda con el ejemplo que guardó Meta. */
export function metaToDraft(t: MetaTemplate): TemplateDraft {
  const c = (type: string) => (t.components ?? []).find((x) => x.type?.toUpperCase() === type)
  const h = c("HEADER")
  const hf = (h?.format ?? "TEXT").toUpperCase()
  const header: DraftHeader = !h ? { type: "none" } : hf === "TEXT" ? { type: "text", text: h.text ?? "", example: h.example?.header_text?.[0] ?? "" } : { type: "image", url: h.example?.header_handle?.[0] ?? "" }
  const body = c("BODY")
  const buttons: DraftButton[] = (c("BUTTONS")?.buttons ?? []).flatMap((b): DraftButton[] => {
    const bt = b.type?.toUpperCase()
    if (bt === "QUICK_REPLY") return [{ type: "quick_reply", text: b.text ?? "" }]
    if (bt === "PHONE_NUMBER") return [{ type: "phone", text: b.text ?? "", phone: b.phone_number ?? "" }]
    if (bt === "URL") {
      const url = b.url ?? ""
      const ex = Array.isArray(b.example) ? b.example[0] : b.example
      return [{ type: "url", text: b.text ?? "", url, example: isDynamicUrl(url) && ex ? ex.slice(url.replace(/\{\{\s*1\s*\}\}$/, "").length) : undefined }]
    }
    return []
  })
  return {
    name: t.name, language: t.language, category: (t.category?.toUpperCase() === "MARKETING" ? "MARKETING" : "UTILITY"), header,
    body: body?.text ?? "", examples: body?.example?.body_text?.[0] ?? [], footer: c("FOOTER")?.text ?? "", buttons,
  }
}

/** ¿Meta deja editar una plantilla en este estado? (aprobada, rechazada o en pausa; no mientras está en revisión). */
export const canEdit = (status?: string) => ["APPROVED", "REJECTED", "PAUSED"].includes(String(status ?? "").toUpperCase())

export const STATUS_LABEL: Record<string, { label: string; tone: "pagado" | "porVencer" | "vencido" | "gray" | "info" }> = {
  APPROVED: { label: "Aprobada", tone: "pagado" }, PENDING: { label: "En revisión", tone: "porVencer" }, IN_APPEAL: { label: "En apelación", tone: "porVencer" },
  REJECTED: { label: "Rechazada", tone: "vencido" }, PAUSED: { label: "En pausa", tone: "vencido" }, DISABLED: { label: "Desactivada", tone: "vencido" },
  PENDING_DELETION: { label: "Eliminándose", tone: "gray" }, DELETED: { label: "Eliminada", tone: "gray" }, LIMIT_EXCEEDED: { label: "Límite excedido", tone: "vencido" }, ARCHIVED: { label: "Archivada", tone: "gray" },
}

/** Motivo de rechazo de Meta en español. */
export const REJECT_REASON: Record<string, string> = {
  ABUSIVE_CONTENT: "Contenido abusivo", INVALID_FORMAT: "Formato inválido (revisa variables, ejemplos y longitudes)", PROMOTIONAL: "Contenido promocional en una plantilla de utilidad: cámbiala a Marketing o quita lo promocional",
  TAG_CONTENT_MISMATCH: "La categoría no corresponde al contenido", SCAM: "Meta la consideró posible fraude", INCORRECT_CATEGORY: "Categoría incorrecta", NONE: "",
}
