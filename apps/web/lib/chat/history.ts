// Historial del chat: título automático (sin IA), agrupación por fecha (Fijadas, Hoy, Ayer, 7 días, Antes) y búsqueda.
// Puro, con pruebas en history.test.ts.
import { clip } from "@/lib/ai/compact"
import { norm } from "@/lib/domain"

const SALUDO = /^(buenos d[ií]as|buenas tardes|buenas noches|buenas|hola|holi|hey|oye|mirai)\b[\s,!.:]*/i
const RELLENO = /^(por favor|porfa|me puedes decir|me podr[ií]as decir|me dices|quiero saber|quisiera saber|necesito saber|dime|cu[eé]ntame|ay[uú]dame a saber|una pregunta)\b[\s,:]*/i

/** Título corto de la conversación a partir del primer mensaje: sin saludos ni signos, máx. 48 caracteres. */
export function autoTitle(text: string, max = 48): string {
  let t = (text ?? "").replace(/\s+/g, " ").trim()
  for (let i = 0; i < 3; i++) {
    const before = t
    t = t.replace(/^[¿¡"'“]+/, "").replace(SALUDO, "").replace(RELLENO, "").replace(/^[¿¡"'“]+/, "").trim()
    if (t === before) break
  }
  t = t.replace(/[?!.…"'”]+$/, "").trim()
  if (!t) return "Nueva conversación"
  t = t.charAt(0).toUpperCase() + t.slice(1)
  return clip(t, max).replace(/[,;:]…$/, "…")
}

export type GroupKey = "fijadas" | "hoy" | "ayer" | "semana" | "antes"
export const GROUP_LABEL: Record<GroupKey, string> = { fijadas: "Fijadas", hoy: "Hoy", ayer: "Ayer", semana: "Últimos 7 días", antes: "Antes" }

const dayStart = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()

/** Grupo de una fecha según días calendario (no horas): hoy, ayer, últimos 7 días o antes. */
export function groupOf(iso: string, now: Date): Exclude<GroupKey, "fijadas"> {
  const diff = Math.round((dayStart(now) - dayStart(new Date(iso))) / 864e5)
  return diff <= 0 ? "hoy" : diff === 1 ? "ayer" : diff < 7 ? "semana" : "antes"
}

/** Agrupa las conversaciones (ya ordenadas de la más reciente a la más antigua). Las fijadas van primero. */
export function groupThreads<T extends { fijado?: boolean; updated_at: string }>(threads: T[], now: Date): { key: GroupKey; label: string; items: T[] }[] {
  const order: GroupKey[] = ["fijadas", "hoy", "ayer", "semana", "antes"]
  const by = new Map<GroupKey, T[]>()
  for (const t of threads) {
    const k: GroupKey = t.fijado ? "fijadas" : groupOf(t.updated_at, now)
    by.set(k, [...(by.get(k) ?? []), t])
  }
  return order.filter((k) => by.get(k)?.length).map((k) => ({ key: k, label: GROUP_LABEL[k], items: by.get(k)! }))
}

/** ¿La conversación coincide con la búsqueda? (sin tildes ni mayúsculas; todas las palabras deben aparecer). */
export function matchThread(t: { titulo: string; ultimo?: string }, q: string, extraIds?: Set<string>, id?: string): boolean {
  const words = norm(q).split(/\s+/).filter(Boolean)
  if (!words.length) return true
  if (id && extraIds?.has(id)) return true
  const hay = norm(`${t.titulo} ${t.ultimo ?? ""}`)
  return words.every((w) => hay.includes(w))
}

/** Vista previa de una respuesta para la lista del historial (sin Markdown). */
export function preview(text: string, max = 90): string {
  return clip((text ?? "").replace(/```[\s\S]*?```/g, " ").replace(/[#*_`>|]/g, "").replace(/\[([^\]]+)\]\([^)]+\)/g, "$1").replace(/\s+/g, " ").trim(), max)
}

// ── Exportar y título sugerido ──

type ExportMsg = { role: string; content: string; created_at: string; meta?: { decision?: { d: { desc?: string; valor?: number | string }; v: string } } }
const VERD_TXT: Record<string, string> = { si: "Te alcanza", cuidado: "Puedes, pero con cuidado", no: "Mejor no, por ahora" }
const hora = (iso: string) => { try { return new Date(iso).toLocaleString("es-CO", { dateStyle: "medium", timeStyle: "short" }) } catch { return "" } }

/** Conversación en Markdown (para descargar o compartir). */
export function threadMarkdown(t: { titulo: string; created_at?: string }, msgs: ExportMsg[]): string {
  const out = [`# ${t.titulo}`, "", `_Conversación con Mirai${t.created_at ? ` · ${hora(t.created_at)}` : ""}_`, ""]
  for (const m of msgs) {
    out.push(`### ${m.role === "user" ? "Tú" : "Mirai"}${m.created_at ? ` · ${hora(m.created_at)}` : ""}`, "")
    if (m.meta?.decision) out.push(`> **${VERD_TXT[m.meta.decision.v] ?? "Análisis"}** · ${m.meta.decision.d.desc ?? ""}`, "")
    out.push(m.content.trim(), "")
  }
  out.push("---", "_Orientación con tus datos de Mirai. No reemplaza a un asesor certificado._")
  return out.join("\n")
}

/** Conversación como texto plano (para copiar). */
export function threadPlain(t: { titulo: string }, msgs: ExportMsg[]): string {
  return [t.titulo, "", ...msgs.map((m) => `${m.role === "user" ? "Tú" : "Mirai"}: ${m.content.replace(/\*\*([^*]+)\*\*/g, "$1").replace(/[#`>]/g, "").trim()}`)].join("\n\n")
}

/** Título sin IA: el tema más repetido de lo que preguntó la persona, o su primera pregunta resumida. */
export function smartTitle(msgs: { role: string; content: string }[]): string {
  const asks = msgs.filter((m) => m.role === "user" && m.content.trim())
  if (!asks.length) return "Nueva conversación"
  const first = autoTitle(asks[0].content, 44)
  if (asks.length === 1) return first
  const words = new Map<string, number>()
  for (const a of asks) for (const w of new Set(norm(a.content).split(/[^a-zñ]+/).filter((x) => x.length > 4 && !STOP.has(x)))) words.set(w, (words.get(w) ?? 0) + 1)
  const top = [...words.entries()].filter(([, n]) => n > 1).sort((a, b) => b[1] - a[1]).slice(0, 2).map(([w]) => w)
  return top.length ? autoTitle(`${top.join(" y ")}: ${first.toLowerCase()}`, 48) : first
}
const STOP = new Set(["cuanto", "cuanta", "cuantos", "quiero", "puedo", "tengo", "tienes", "sobre", "donde", "cuando", "porque", "debería", "deberia", "conviene", "explicame", "ahora", "entonces", "gracias", "mirai", "hacer", "tambien", "pregunta", "dime", "favor"])
