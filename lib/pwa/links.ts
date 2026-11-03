// Enlaces de la app instalada: web+mirai://… y lo que llega al compartir a Mirai desde otra app. Puro (se prueba en
// links.test.ts) y sin alias "@/".
import { PROTOCOL, PWA_SHORTCUTS } from "./config"
import { safeNext } from "../security/safe-next"

/** Destinos de web+mirai://<clave> (además de los accesos directos por su id: gasto, ingreso, deuda…). */
const ALIAS: Record<string, string> = {
  inicio: "/inicio",
  gastos: "/gastos",
  ingresos: "/ingresos",
  "le-debo": "/le-debo",
  "me-deben": "/me-deben",
  pagos: "/recordatorios",
  recordatorios: "/recordatorios",
  calendario: "/calendario",
  balance: "/balance",
  metas: "/metas",
  meta: "/metas?nuevo=1",
  tarjetas: "/tarjetas",
  importar: "/importar",
  ajustes: "/ajustes",
  chat: "/consejero",
}

/**
 * Convierte un enlace web+mirai://gasto (o web+mirai:gasto, o web+mirai://ruta/interna?x=1) en una ruta de Mirai.
 * Lo que no se reconoce va a Inicio.
 */
export function resolveProtocolUrl(raw: string | null | undefined): string {
  if (!raw) return "/inicio"
  let s = raw.trim()
  try { s = decodeURIComponent(s) } catch { /* ya venía sin codificar */ }
  const pre = new RegExp(`^${PROTOCOL.replace(/[+]/g, "\\+")}:(//)?`, "i")
  if (!pre.test(s)) return "/inicio"
  const rest = s.replace(pre, "").replace(/^\/+/, "")
  const [head, ...tail] = rest.split(/(?=[/?#])/)
  const key = (head ?? "").toLowerCase()
  const sc = PWA_SHORTCUTS.find((x) => x.id === key)
  if (sc) return sc.url
  if (ALIAS[key] && !tail.length) return ALIAS[key]
  return key ? safeNext(`/${key}${tail.join("")}`) : "/inicio"
}

/** Un valor en pesos dentro de un texto ("Pagaste $45.900 en Éxito", "COP 1.250.000", "120 mil"). */
export function parseCop(text: string): number | null {
  const t = text.replace(/\u00a0/g, " ")
  const mil = t.match(/(\d{1,3}(?:[.,]\d{3})*|\d+)\s*(mil|k)\b/i)
  if (mil) return Number(mil[1]!.replace(/[.,]/g, "")) * 1000
  const m = t.match(/(?:\$|cop|col\$)\s*(\d{1,3}(?:[.\s]\d{3})+|\d+)(?:,(\d{1,2}))?/i) ?? t.match(/(\d{1,3}(?:\.\d{3})+)(?:,(\d{1,2}))?/)
  if (!m) return null
  const n = Number(m[1]!.replace(/[.\s]/g, ""))
  return Number.isFinite(n) && n > 0 ? n : null
}

export type SharedText = { descripcion: string; valor: number | null }

/** Lo que llega al compartir un texto o enlace a Mirai → descripción y valor sugeridos para Registrar gasto. */
export function parseSharedText(p: { title?: string | null; text?: string | null; url?: string | null }): SharedText | null {
  const all = [p.title, p.text, p.url].map((x) => (x ?? "").trim()).filter(Boolean)
  if (!all.length) return null
  const joined = all.join(" · ")
  const valor = parseCop(joined)
  // La descripción: el título o la primera línea del texto, sin URLs ni el valor, máximo 80 caracteres.
  const base = (p.title?.trim() || p.text?.split(/\r?\n/).find((l) => l.trim())?.trim() || "")
    .replace(/https?:\/\/\S+/g, "")
    .replace(/(?:\$|cop)\s*[\d.,\s]+/gi, "")
    .replace(/\s{2,}/g, " ")
    .replace(/^[\s·:,-]+|[\s·:,-]+$/g, "")
  return { descripcion: base.slice(0, 80), valor }
}

/** URL de Registrar gasto con lo que se compartió (la lee features/pwa/shared.ts). */
export function shareRedirectUrl(o: { file?: boolean; text?: SharedText | null }): string {
  const q = new URLSearchParams({ nuevo: "1", compartido: o.file ? "archivo" : "texto" })
  if (o.text?.descripcion) q.set("desc", o.text.descripcion)
  if (o.text?.valor) q.set("valor", String(Math.round(o.text.valor)))
  return `/gastos?${q.toString()}`
}
