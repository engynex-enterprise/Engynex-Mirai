// Markdown del chat (lo que escriben la IA y los algoritmos): títulos, párrafos, listas (con un nivel de anidación),
// citas, tablas, código y separadores; en línea: **negrita**, *cursiva*, `código`, [enlaces](https://…) y montos
// ($ 1.234.567) marcados para el modo privado. Puro y tolerante a texto a medias (streaming). Pruebas en markdown.test.ts.

export type Inline =
  | { t: "text"; v: string }
  | { t: "b"; c: Inline[] }
  | { t: "i"; c: Inline[] }
  | { t: "code"; v: string }
  | { t: "a"; href: string; c: Inline[] }
  | { t: "money"; v: string }

export type ListItem = { c: Inline[]; sub?: { ordered: boolean; items: ListItem[] } }

export type Block =
  | { t: "h"; level: 1 | 2 | 3 | 4; c: Inline[] }
  | { t: "p"; lines: Inline[][] }
  | { t: "ul" | "ol"; items: ListItem[]; start?: number }
  | { t: "quote"; blocks: Block[] }
  | { t: "code"; lang: string; v: string }
  | { t: "table"; head: Inline[][]; align: ("left" | "center" | "right" | null)[]; rows: Inline[][][] }
  | { t: "hr" }

const MONEY = /\$\s?-?\d{1,3}(?:\.\d{3})+(?:,\d+)?|\$\s?-?\d+(?:,\d+)?/
const TOKEN = new RegExp(
  [
    /`([^`\n]+)`/.source, // 1 código
    /\*\*([^*\n](?:[^*\n]|\*(?!\*))*?)\*\*/.source, // 2 negrita
    /__([^_\n]+)__/.source, // 3 negrita con _
    /\[([^\]\n]+)\]\(((?:https?:\/\/|\/|mailto:)[^)\s]+)\)/.source, // 4,5 enlace
    /(?<![\w*])\*([^*\s\n](?:[^*\n]*[^*\s\n])?)\*(?![\w*])/.source, // 6 cursiva
    /(?<![\w_])_([^_\s\n](?:[^_\n]*[^_\s\n])?)_(?![\w_])/.source, // 7 cursiva con _
    `(${MONEY.source})`, // 8 monto
  ].join("|"),
  "g",
)

/** Texto en línea → nodos. */
export function inline(raw: string): Inline[] {
  // Mientras llega el texto, un "**" sin pareja (negrita que aún no se cierra) no se muestra.
  const marks = raw.match(/\*\*/g)?.length ?? 0
  const src = marks % 2 ? raw.slice(0, raw.lastIndexOf("**")) + raw.slice(raw.lastIndexOf("**") + 2) : raw
  const out: Inline[] = []
  let last = 0
  const push = (v: string) => { if (v) { const p = out[out.length - 1]; if (p?.t === "text") p.v += v; else out.push({ t: "text", v }) } }
  for (const m of src.matchAll(TOKEN)) {
    push(src.slice(last, m.index))
    if (m[1] !== undefined) out.push({ t: "code", v: m[1] })
    else if (m[2] !== undefined || m[3] !== undefined) out.push({ t: "b", c: inline(m[2] ?? m[3]) })
    else if (m[4] !== undefined) out.push({ t: "a", href: m[5], c: inline(m[4]) })
    else if (m[6] !== undefined || m[7] !== undefined) out.push({ t: "i", c: inline(m[6] ?? m[7]) })
    else if (m[8] !== undefined) out.push({ t: "money", v: m[8] })
    last = m.index + m[0].length
  }
  push(src.slice(last))
  return out
}

const LIST_RE = /^(\s*)([-*•+]|\d{1,3}[.)])\s+(.*)$/
const TABLE_SEP = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/
const cells = (line: string) => line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map((c) => c.trim())

/** Texto completo → bloques. */
export function parseMarkdown(src: string): Block[] {
  const lines = (src ?? "").replace(/\r\n?/g, "\n").split("\n")
  const out: Block[] = []
  let i = 0
  while (i < lines.length) {
    const line = lines[i]
    if (!line.trim()) { i++; continue }
    // Código entre ``` (si aún no se cierra, va hasta el final)
    const fence = line.match(/^\s*```\s*([\w-]*)/)
    if (fence) {
      const buf: string[] = []
      i++
      while (i < lines.length && !/^\s*```/.test(lines[i])) buf.push(lines[i++])
      i++
      out.push({ t: "code", lang: fence[1] ?? "", v: buf.join("\n") })
      continue
    }
    const h = line.match(/^\s{0,3}(#{1,4})\s+(.*?)\s*#*\s*$/)
    if (h) { out.push({ t: "h", level: h[1].length as 1, c: inline(h[2]) }); i++; continue }
    if (/^\s{0,3}([-*_])(\s*\1){2,}\s*$/.test(line)) { out.push({ t: "hr" }); i++; continue }
    // Tabla: encabezado + separador
    if (line.includes("|") && i + 1 < lines.length && TABLE_SEP.test(lines[i + 1])) {
      const head = cells(line)
      const align = cells(lines[i + 1]).map((c) => (/^:-+:$/.test(c) ? "center" : /-+:$/.test(c) ? "right" : /^:-+/.test(c) ? "left" : null))
      const rows: Inline[][][] = []
      i += 2
      while (i < lines.length && lines[i].includes("|") && lines[i].trim()) rows.push(cells(lines[i++]).map(inline))
      out.push({ t: "table", head: head.map(inline), align, rows })
      continue
    }
    if (/^\s{0,3}>/.test(line)) {
      const buf: string[] = []
      while (i < lines.length && /^\s{0,3}>/.test(lines[i])) buf.push(lines[i++].replace(/^\s{0,3}>\s?/, ""))
      out.push({ t: "quote", blocks: parseMarkdown(buf.join("\n")) })
      continue
    }
    const li = line.match(LIST_RE)
    if (li) {
      const ordered = /\d/.test(li[2])
      const base = li[1].length
      const items: ListItem[] = []
      while (i < lines.length) {
        const m = lines[i].match(LIST_RE)
        if (!m) {
          // Línea que continúa el ítem anterior (sangrada)
          if (lines[i].trim() && /^\s{2,}/.test(lines[i]) && items.length) { items[items.length - 1].c.push({ t: "text", v: " " }, ...inline(lines[i].trim())); i++; continue }
          break
        }
        if (m[1].length > base + 1 && items.length) {
          const parent = items[items.length - 1]
          parent.sub ??= { ordered: /\d/.test(m[2]), items: [] }
          parent.sub.items.push({ c: inline(m[3]) })
        } else if (/\d/.test(m[2]) === ordered) items.push({ c: inline(m[3]) })
        else break
        i++
      }
      out.push(ordered ? { t: "ol", items, start: parseInt(li[2], 10) || 1 } : { t: "ul", items })
      continue
    }
    // Párrafo: líneas seguidas hasta una vacía o un bloque distinto
    const para: Inline[][] = []
    while (i < lines.length && lines[i].trim() && !LIST_RE.test(lines[i]) && !/^\s{0,3}(#{1,4}\s|>|```)/.test(lines[i]) && !(lines[i].includes("|") && TABLE_SEP.test(lines[i + 1] ?? ""))) para.push(inline(lines[i++].trim()))
    if (para.length) out.push({ t: "p", lines: para })
    else i++
  }
  return out
}

/** Texto plano (para copiar sin símbolos o leer en voz alta). */
export function plainText(src: string): string {
  return (src ?? "")
    .replace(/```[\w-]*\n?([\s\S]*?)```/g, "$1")
    .replace(/\*\*([^*]+)\*\*/g, "$1").replace(/__([^_]+)__/g, "$1").replace(/`([^`]+)`/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1").replace(/^\s{0,3}#{1,4}\s+/gm, "").replace(/^\s{0,3}>\s?/gm, "")
    .trim()
}
