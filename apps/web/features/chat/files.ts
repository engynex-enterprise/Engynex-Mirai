// Adjuntos del chat, preparados en el navegador antes de enviarlos a la API:
// - Fotos: se reducen (lado mayor 2.000 px, JPEG) para que varias quepan en un envío y la IA lea más rápido.
// - PDF: tal cual.
// - Word (.docx), Excel (.xlsx) y CSV/TXT: se convierten a texto aquí (mammoth y exceljs), así el servidor nunca abre
//   documentos de Office. La IA recibe el texto con el nombre del archivo.
// Topes iguales a los de la API (@mirai/ai/server/chat-actions): hasta 5 archivos, 6 MB entre todos.

export const MAX_FILES = 5
/** Un poco menos que los 6 MB de la API: en base64 crecen un tercio y el cuerpo de la API acepta hasta 8 MB. */
export const MAX_TOTAL = 5.8 * 1024 * 1024
/** Lo que se puede elegir en el selector de archivos. */
export const ACCEPT = "image/*,application/pdf,.pdf,.docx,.xlsx,.csv,.txt,.md,text/plain,text/csv,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"

export type Kind = "foto" | "pdf" | "word" | "excel" | "texto"

const ext = (f: File) => f.name.split(".").pop()?.toLowerCase() ?? ""

/** Qué es el archivo (o null si el chat no lo lee). */
export function kindOf(f: File): Kind | null {
  const e = ext(f)
  if (f.type.startsWith("image/") || ["jpg", "jpeg", "png", "webp", "gif", "heic", "heif", "avif"].includes(e)) return "foto"
  if (f.type === "application/pdf" || e === "pdf") return "pdf"
  if (e === "docx") return "word"
  if (e === "xlsx") return "excel"
  if (["csv", "txt", "md", "tsv"].includes(e) || f.type.startsWith("text/")) return "texto"
  return null
}

/** Mensaje si el archivo no sirve (null = sirve). */
export function fileProblem(f: File): string | null {
  const e = ext(f)
  if (e === "doc") return `«${f.name}» es un Word antiguo (.doc): guárdalo como .docx o PDF.`
  if (e === "xls") return `«${f.name}» es un Excel antiguo (.xls): guárdalo como .xlsx o CSV.`
  if (!kindOf(f)) return `No puedo leer «${f.name}». Usa fotos, PDF, Word, Excel o CSV.`
  if (f.size > 15 * 1024 * 1024) return `«${f.name}» pesa más de 15 MB.`
  return null
}

const asText = (name: string, text: string) => new File([text], name, { type: "text/plain" })

/** Foto reducida a JPEG (las HEIC u otras que el navegador no abre se envían tal cual). */
async function shrink(f: File): Promise<File> {
  if (f.type === "image/gif" || f.size < 350 * 1024) return f
  try {
    const bmp = await createImageBitmap(f)
    const k = Math.min(1, 2000 / Math.max(bmp.width, bmp.height))
    const canvas = document.createElement("canvas")
    canvas.width = Math.round(bmp.width * k)
    canvas.height = Math.round(bmp.height * k)
    canvas.getContext("2d")!.drawImage(bmp, 0, 0, canvas.width, canvas.height)
    bmp.close()
    const blob = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, "image/jpeg", 0.85))
    if (!blob || blob.size >= f.size) return f
    return new File([blob], f.name.replace(/\.\w+$/, "") + ".jpg", { type: "image/jpeg" })
  } catch { return f }
}

/** Excel → texto: cada hoja con sus filas separadas por ";". */
async function excelText(f: File): Promise<string> {
  const ExcelJS = (await import("exceljs")).default
  const wb = new ExcelJS.Workbook()
  await wb.xlsx.load(await f.arrayBuffer())
  const out: string[] = []
  for (const ws of wb.worksheets) {
    out.push(`# Hoja: ${ws.name}`)
    ws.eachRow((row) => {
      const cells = (row.values as unknown[]).slice(1).map((v) => {
        if (v == null) return ""
        if (v instanceof Date) return v.toISOString().slice(0, 10)
        if (typeof v === "object") { const o = v as { result?: unknown; text?: unknown; richText?: { text: string }[] }; return String(o.result ?? o.text ?? o.richText?.map((r) => r.text).join("") ?? "") }
        return String(v)
      })
      if (cells.some((c) => c.trim())) out.push(cells.join(";"))
    })
  }
  return out.join("\n")
}

/** Archivo listo para enviar (foto reducida, PDF o texto). Lanza un Error con el mensaje para la persona. */
export async function prepare(f: File): Promise<File> {
  const bad = fileProblem(f)
  if (bad) throw new Error(bad)
  switch (kindOf(f)) {
    case "foto": return shrink(f)
    case "pdf": return f.type === "application/pdf" ? f : new File([f], f.name, { type: "application/pdf" })
    case "word": {
      const mammoth = (await import("mammoth")).default
      const { value } = await mammoth.extractRawText({ arrayBuffer: await f.arrayBuffer() })
      if (!value.trim()) throw new Error(`«${f.name}» no tiene texto que pueda leer.`)
      return asText(f.name, value)
    }
    case "excel": return asText(f.name, await excelText(f))
    default: return asText(f.name, await f.text())
  }
}
