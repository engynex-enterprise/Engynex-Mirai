// Centro de ayuda: rutas internas del panel, índice y búsqueda global, novedades no leídas, manual por sección,
// atajos y contenido relacionado con la página actual. Todo es lógica pura (se prueba con Vitest).
import { PAGES } from "@/lib/nav"
import { APP_VER, FAQ, GUIDES, RELEASES, stripHtml, type Faq, type Guide, type Release, type ReleaseItem } from "./ayuda"
import { HELP, type HelpEntry } from "./help"
import { LECCIONES, type Leccion } from "./academia"
import { GLOSARIO, GLOSARIO_CATS, type Termino } from "./glosario"

// ───────────────────────────── Rutas internas del panel ─────────────────────────────

export type HelpRoute =
  | { v: "inicio" }
  | { v: "pagina"; id: string }
  | { v: "novedades" }
  | { v: "faq"; id?: string }
  | { v: "manual"; id?: string }
  | { v: "guias" }
  | { v: "guia"; id: string }
  | { v: "academia" }
  | { v: "leccion"; id: string }
  | { v: "glosario"; id?: string }
  | { v: "atajos" }
  | { v: "opinion"; tipo?: string }
  | { v: "soporte" }
  | { v: "estado" }

export type HelpView = HelpRoute["v"]
const VIEWS: HelpView[] = ["inicio", "pagina", "novedades", "faq", "manual", "guias", "guia", "academia", "leccion", "glosario", "atajos", "opinion", "soporte", "estado"]
const WITH_ID: Partial<Record<HelpView, "id" | "tipo">> = { pagina: "id", faq: "id", manual: "id", guia: "id", leccion: "id", glosario: "id", opinion: "tipo" }

/**
 * El panel se abre con `useShell().setHelp(clave)`. Claves:
 * - `"gastos"` (id de una sección, como lo usa el botón "Cómo funciona"): ayuda de esa página.
 * - `"@"`: portada del Centro de ayuda. `"@novedades"`, `"@guia:nomina"`, `"@glosario:uvt"`…: una vista interna.
 */
export function parseHelpKey(key: string | null | undefined): HelpRoute | null {
  if (key == null) return null
  if (!key.startsWith("@")) return key ? { v: "pagina", id: key } : { v: "inicio" }
  const [view, ...rest] = key.slice(1).split(":")
  const arg = rest.join(":") || undefined
  if (!view) return { v: "inicio" }
  if (!VIEWS.includes(view as HelpView)) return { v: "inicio" }
  const field = WITH_ID[view as HelpView]
  if (view === "pagina" || view === "guia" || view === "leccion") return arg ? ({ v: view, id: arg } as HelpRoute) : { v: "inicio" }
  if (field && arg) return { v: view, [field]: arg } as HelpRoute
  return { v: view } as HelpRoute
}

export function helpKey(r: HelpRoute): string {
  if (r.v === "inicio") return "@"
  if (r.v === "pagina") return r.id
  const field = WITH_ID[r.v]
  const arg = field ? (r as Record<string, string | undefined>)[field] : undefined
  return `@${r.v}${arg ? `:${arg}` : ""}`
}

/** Pila de navegación inicial al abrir el panel con una clave: la portada siempre queda debajo (botón Atrás). */
export function initialStack(key: string | null | undefined): HelpRoute[] {
  const r = parseHelpKey(key)
  if (!r || r.v === "inicio") return [{ v: "inicio" }]
  return [{ v: "inicio" }, r]
}

// ───────────────────────────── Texto y normalización ─────────────────────────────

/** Minúsculas, sin tildes ni signos, espacios colapsados. */
export const normText = (s: unknown) =>
  String(s ?? "").toLowerCase().replace(/×/g, "x").normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/<[^>]+>/g, " ").replace(/[^a-z0-9%/.\s-]/g, " ").replace(/\s+/g, " ").trim()

const STOP = new Set("a al como con cual cuando de del donde el en es esta este hay la las lo los me mi mis no o para pero por que se si sin su sus te tu tus un una uno y ya yo".split(" "))

/** Palabras útiles de una búsqueda (sin palabras vacías; si todo es vacío, las deja). */
export function tokens(q: string) {
  const all = normText(q).split(" ").filter(Boolean)
  const useful = all.filter((w) => !STOP.has(w))
  return useful.length ? useful : all
}

// ───────────────────────────── Índice y búsqueda global ─────────────────────────────

export type DocKind = "pagina" | "faq" | "novedad" | "guia" | "leccion" | "glosario" | "atajo"
export const DOC_KINDS: Record<DocKind, { label: string; icon: string }> = {
  pagina: { label: "Manual", icon: "book-open" },
  faq: { label: "Pregunta frecuente", icon: "circle-help" },
  guia: { label: "Guía paso a paso", icon: "list-checks" },
  glosario: { label: "Glosario", icon: "library" },
  leccion: { label: "Academia", icon: "graduation-cap" },
  novedad: { label: "Novedad", icon: "megaphone" },
  atajo: { label: "Atajo de teclado", icon: "command" },
}

export type HelpDoc = { kind: DocKind; id: string; title: string; text: string; route: HelpRoute; sub?: string }
export type HelpHit = HelpDoc & { score: number }

export const faqId = (f: Pick<Faq, "q">) => normText(f.q).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 80)
export const releaseKey = (v: string, title: string) => `${v}·${title}`

export function buildHelpIndex(): HelpDoc[] {
  const docs: HelpDoc[] = []
  for (const p of PAGES) {
    const h = HELP[p.id]
    if (h) docs.push({ kind: "pagina", id: p.id, title: h.t, text: `${p.label} ${h.i} ${h.p.join(" ")} ${(h.tips ?? []).join(" ")}`, route: { v: "pagina", id: p.id }, sub: p.group?.label ?? p.section })
  }
  for (const f of FAQ) docs.push({ kind: "faq", id: faqId(f), title: f.q, text: `${f.c} ${f.a}`, route: { v: "faq", id: faqId(f) }, sub: f.c })
  for (const g of GUIDES) docs.push({ kind: "guia", id: g.id, title: g.t, text: `${g.s.join(" ")} ${g.tip ?? ""}`, route: { v: "guia", id: g.id }, sub: `${g.s.length} pasos · ${g.min} min` })
  for (const t of GLOSARIO) docs.push({ kind: "glosario", id: t.id, title: t.t, text: `${t.sigla ?? ""} ${t.d} ${t.ej ?? ""}`, route: { v: "glosario", id: t.id }, sub: GLOSARIO_CATS[t.cat].label })
  for (const l of LECCIONES) docs.push({ kind: "leccion", id: l.id, title: l.titulo, text: `${l.puntos.join(" ")} ${l.pregunta.q}`, route: { v: "leccion", id: l.id }, sub: `${l.minutos} min` })
  for (const r of RELEASES.slice(0, 8)) for (const [, t, d] of r.items) docs.push({ kind: "novedad", id: releaseKey(r.v, t), title: t, text: d, route: { v: "novedades" }, sub: `Versión ${r.v}` })
  for (const a of ATAJOS) docs.push({ kind: "atajo", id: a.id, title: a.d, text: `${a.keys.join(" ")} atajo teclado`, route: { v: "atajos" }, sub: a.keys.join(" + ") })
  return docs
}

const KIND_BOOST: Record<DocKind, number> = { glosario: 1.5, pagina: 1.2, faq: 1.1, guia: 1.1, leccion: 1, atajo: 0.9, novedad: 0.7 }

/**
 * Busca en todo el contenido de ayuda. Cada palabra útil debe aparecer en el título o el texto (búsqueda "Y").
 * Puntúa más las coincidencias en el título, la frase completa y el inicio de palabra.
 */
export function searchHelp(docs: HelpDoc[], q: string, { limit = 30, kinds }: { limit?: number; kinds?: DocKind[] } = {}): HelpHit[] {
  const ws = tokens(q)
  if (!ws.length) return []
  const phrase = normText(q)
  const hits: HelpHit[] = []
  for (const d of docs) {
    if (kinds && !kinds.includes(d.kind)) continue
    const title = normText(d.title)
    const body = normText(`${d.text} ${d.sub ?? ""}`)
    let score = 0
    let ok = true
    for (const w of ws) {
      const inTitle = title.includes(w)
      const inBody = body.includes(w)
      if (!inTitle && !inBody) { ok = false; break }
      if (inTitle) score += new RegExp(`(^|\\s)${w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`).test(title) ? 4 : 3
      if (inBody) score += 1
    }
    if (!ok) continue
    if (phrase.length > 2 && title.includes(phrase)) score += 5
    if (title === phrase) score += 10
    hits.push({ ...d, score: score * KIND_BOOST[d.kind] })
  }
  return hits.sort((a, b) => b.score - a.score || a.title.localeCompare(b.title, "es")).slice(0, limit)
}

/** Resultados agrupados por tipo, en el orden de DOC_KINDS. */
export function groupHits(hits: HelpHit[]) {
  return (Object.keys(DOC_KINDS) as DocKind[]).map((k) => ({ kind: k, hits: hits.filter((h) => h.kind === k) })).filter((g) => g.hits.length)
}

// ───────────────────────────── Novedades ─────────────────────────────

/** Compara versiones "5.10" > "5.4". */
export function cmpVer(a: string, b: string) {
  const pa = a.split(".").map(Number)
  const pb = b.split(".").map(Number)
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0)
    if (d) return d
  }
  return 0
}

/**
 * Claves de las novedades sin leer: las de la versión actual y las de versiones posteriores a la última vista,
 * menos las que la persona marcó como leídas. Una persona nueva solo ve como no leídas las de la versión actual.
 */
export function novedadesNoLeidas({ releases = RELEASES, seen, leidas = [], appVer = APP_VER }: { releases?: Release[]; seen?: string | null; leidas?: string[]; appVer?: string }) {
  const read = new Set(leidas)
  return releases
    .filter((r) => r.v === appVer || (seen ? cmpVer(r.v, seen) > 0 && cmpVer(r.v, appVer) <= 0 : false))
    .flatMap((r) => r.items.map((i) => releaseKey(r.v, i[1])))
    .filter((k) => !read.has(k))
}

export type KindFilter = "todas" | ReleaseItem[0]
/** Filtra versiones por tipo de cambio, texto y no leídas; quita las versiones que quedan vacías. */
export function filtrarNovedades(releases: Release[], { kind = "todas", q = "", soloNoLeidas = false, noLeidas = [] }: { kind?: KindFilter; q?: string; soloNoLeidas?: boolean; noLeidas?: string[] }) {
  const ws = q.trim() ? tokens(q) : []
  const unread = new Set(noLeidas)
  return releases
    .map((r) => ({
      ...r,
      items: r.items.filter(([k, t, d]) => (kind === "todas" || k === kind) && (!soloNoLeidas || unread.has(releaseKey(r.v, t))) && ws.every((w) => normText(`${t} ${d}`).includes(w))),
    }))
    .filter((r) => r.items.length)
}

// ───────────────────────────── Preguntas frecuentes ─────────────────────────────

export function filtrarFaq(faq: Faq[], { q = "", cat = "Todas" }: { q?: string; cat?: string }) {
  const ws = q.trim() ? tokens(q) : []
  return faq.filter((f) => (cat === "Todas" || f.c === cat) && ws.every((w) => normText(`${f.q} ${stripHtml(f.a)} ${f.c}`).includes(w)))
}

/** Votos "¿Te sirvió?": 1 = sí, -1 = no. */
export type FaqVotos = Record<string, 1 | -1>

// ───────────────────────────── Manual por sección ─────────────────────────────

export type ManualItem = { id: string; label: string; icon: string; href: string; group?: string; help: HelpEntry }
/** Secciones del menú (en su orden) con la ayuda de cada pantalla. */
export function manualSecciones(q = ""): { sec: string; items: ManualItem[] }[] {
  const ws = q.trim() ? tokens(q) : []
  const out: { sec: string; items: ManualItem[] }[] = []
  for (const p of PAGES) {
    const h = HELP[p.id]
    if (!h) continue
    if (ws.length && !ws.every((w) => normText(`${p.label} ${h.t} ${h.i} ${h.p.join(" ")} ${(h.tips ?? []).join(" ")}`).includes(w))) continue
    let s = out.find((x) => x.sec === p.section)
    if (!s) out.push((s = { sec: p.section, items: [] }))
    s.items.push({ id: p.id, label: p.label, icon: p.icon, href: p.href, group: p.group?.label, help: h })
  }
  return out
}

// ───────────────────────────── Página actual ─────────────────────────────

/** Sección de la ruta actual ("/gastos?x" → "gastos"; "/" → "inicio"). Solo si tiene ayuda. */
export function pageIdFromPath(path: string | null | undefined): string | null {
  const seg = (path ?? "").split(/[?#]/)[0].split("/").filter(Boolean)[0] ?? "inicio"
  return HELP[seg] ? seg : null
}

export const pageHref = (id: string) => PAGES.find((p) => p.id === id)?.href ?? `/${id}`

/** Contenido relacionado con una sección: preguntas, guías, lecciones y términos que llevan a ella. */
export function relacionados(id: string): { faqs: Faq[]; guias: Guide[]; lecciones: Leccion[]; terminos: Termino[] } {
  const href = pageHref(id)
  const goes = (go?: string) => !!go && go.split("?")[0] === id
  const linksHere = (h?: string) => !!h && h.split("?")[0] === href
  return {
    faqs: FAQ.filter((f) => goes(f.go)),
    guias: GUIDES.filter((g) => goes(g.go)),
    lecciones: LECCIONES.filter((l) => linksHere(l.ir?.href)),
    terminos: GLOSARIO.filter((t) => linksHere(t.ir?.href)),
  }
}

// ───────────────────────────── Atajos de teclado ─────────────────────────────

export type Atajo = { id: string; keys: string[]; d: string; donde: string }
/** "Mod" se muestra como ⌘ en Mac y Ctrl en Windows/Linux. */
export const ATAJOS: Atajo[] = [
  { id: "buscar", keys: ["Mod", "K"], d: "Buscar en Mirai: secciones, contactos, préstamos y gastos fijos", donde: "En cualquier pantalla" },
  { id: "agregar", keys: ["N"], d: "Agregar un gasto, ingreso, pago u otro registro", donde: "Cuando no estás escribiendo en un campo" },
  { id: "ayuda", keys: ["?"], d: "Abrir el Centro de ayuda", donde: "Cuando no estás escribiendo en un campo" },
  { id: "menu", keys: ["Mod", "B"], d: "Contraer o expandir el menú lateral", donde: "En computador" },
  { id: "cerrar", keys: ["Esc"], d: "Cerrar la ventana, el panel o el buscador abierto", donde: "En cualquier ventana" },
  { id: "resultados", keys: ["↑", "↓", "Enter"], d: "Moverte entre los resultados del buscador y abrir uno", donde: "En el buscador" },
  { id: "campos", keys: ["Tab"], d: "Pasar al siguiente campo de un formulario (Shift + Tab para volver)", donde: "En formularios" },
]
export const keyLabel = (k: string, mac: boolean) => (k === "Mod" ? (mac ? "⌘" : "Ctrl") : k)
