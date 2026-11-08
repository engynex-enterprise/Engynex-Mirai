// IA de los formularios por la API: POST /v1/books/:b/ai/*. La API responde `{ ok:true, data }` y convierte los
// `{ ok:false, msg }` en ApiError con el MISMO texto: aquí se vuelven a armar como resultado. Las fotos y PDF viajan en
// base64 (FileRef de @mirai/contracts).
import { failure, isApiError } from "@/lib/api/errors"
import { activeBookId } from "@/lib/api/session"
import type { FileRef } from "@mirai/contracts/modules/chat"
import type {
  CategorySuggestion, ClassifyItem, ClassifyOut, EntitySuggestion, InvoiceResult, LoanDocData, ParsedNL, PrimaInput, PrimaPlan, ReceiptResult,
} from "@mirai/ai/server/ai-actions"

export type { ClassifyItem, ClassifyOut, LoanDocData }

const client = () => import("@/lib/api/client")
const book = () => ({ bookId: activeBookId() })

/** El rol denegado se lanza (como requireRole). Lo demás es un resultado. */
const rethrowRole = (e: unknown) => {
  if (isApiError(e) && e.code === "ROLE_DENIED") throw e
}

/** Base64 de un archivo en el navegador (sin el prefijo data:). */
export async function toBase64(f: Blob): Promise<string> {
  const bytes = new Uint8Array(await f.arrayBuffer())
  let bin = ""
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(bin)
}

/** El `file` del FormData como FileRef en base64 (la API valida tipo y tamaño con el mismo mensaje). */
export async function fileRefOf(fd: FormData): Promise<FileRef | null> {
  const f = fd.get("file")
  if (!(f instanceof Blob)) return null
  const name = (f as File).name || "archivo"
  return { name, type: f.type || "application/octet-stream", data: await toBase64(f) }
}

const NO_FILE = "No pude leer la imagen. Intenta con una foto más clara o escribe los datos."

/** Foto de la factura: comercio, total, fecha y categoría. */
export async function readInvoice(fd: FormData): Promise<InvoiceResult> {
  try {
    const file = await fileRefOf(fd)
    if (!file) return { ok: false as const, msg: NO_FILE }
    const { browserApi, unwrapData } = await client()
    return { ok: true as const, ...unwrapData(await browserApi().ai.invoice({ params: book(), body: { file } })) }
  } catch (e) {
    return failure(e)
  }
}

/** Categoría y gasto hormiga. Devuelve null si el rol, el plan o la IA no dejan: clasificar es opcional. */
export async function classifyExpenses(items: ClassifyItem[]): Promise<ClassifyOut[] | null> {
  try {
    const { browserApi, unwrapData } = await client()
    return unwrapData(await browserApi().ai.classify({ params: book(), body: { items } })).items
  } catch {
    return null
  }
}

/** Revisa con IA los gastos del mes sin veredicto de hormiga. */
export async function reviewMonthHormiga(k: string): Promise<{ ok: boolean; msg: string }> {
  if (typeof k !== "string" || !/^\d{4}-\d{2}$/.test(k)) return { ok: false, msg: "Mes inválido." }
  try {
    const { browserApi, unwrapData } = await client()
    return { ok: true, msg: unwrapData(await browserApi().ai.hormiga({ params: book(), body: { mes: k } })).msg }
  } catch (e) {
    rethrowRole(e)
    return failure(e)
  }
}

/** Propone nombre, ícono, tipo y tope de una categoría nueva. */
export async function suggestCategory(desc: string, nombre: string, icons: string[]): Promise<CategorySuggestion> {
  try {
    const { browserApi, unwrapData } = await client()
    const s = unwrapData(await browserApi().ai.category({ params: book(), body: { desc, nombre, icons } }))
    return s ? { ok: true, s } : { ok: false }
  } catch (e) {
    rethrowRole(e)
    return { ok: false }
  }
}

/** Identifica un banco o entidad por nombre, sigla o NIT. */
export async function identifyEntity(q: string): Promise<EntitySuggestion> {
  try {
    const { browserApi, unwrapData } = await client()
    const s = unwrapData(await browserApi().ai.entity({ params: book(), body: { q } }))
    return s ? { ok: true, s } : { ok: false }
  } catch (e) {
    rethrowRole(e)
    return { ok: false }
  }
}

/** Lee el documento de un préstamo (foto o PDF). */
export async function readLoanDoc(fd: FormData, kind: "cobrar" | "pagar"): Promise<{ ok: true; d: LoanDocData } | { ok: false; msg: string }> {
  try {
    const file = await fileRefOf(fd)
    if (!file) return { ok: false as const, msg: NO_FILE }
    const { browserApi, unwrapData } = await client()
    return { ok: true as const, d: unwrapData(await browserApi().ai.loanDoc({ params: book(), body: { file, kind } })) as LoanDocData }
  } catch (e) {
    rethrowRole(e)
    return failure(e)
  }
}

/** Lee un comprobante de pago (foto o PDF). */
export async function readReceipt(fd: FormData): Promise<ReceiptResult> {
  try {
    const file = await fileRefOf(fd)
    if (!file) return { ok: false as const, msg: NO_FILE.replace("la imagen", "el comprobante") }
    const { browserApi, unwrapData } = await client()
    return { ok: true as const, ...unwrapData(await browserApi().ai.receipt({ params: book(), body: { file } })) }
  } catch (e) {
    rethrowRole(e)
    return failure(e)
  }
}

/** Reescribe el mensaje de cobro para WhatsApp. El error va en `text`. */
export async function improveCobro(msg: string, tono: "amable" | "directo" | "firme"): Promise<{ ok: boolean; text: string }> {
  try {
    const { browserApi, unwrapData } = await client()
    return { ok: true, text: unwrapData(await browserApi().ai.cobro({ params: book(), body: { msg, tono } })).text }
  } catch (e) {
    return { ok: false, text: failure(e).msg }
  }
}

/** Plan para la próxima prima. */
export async function primaPlan(data: PrimaInput): Promise<PrimaPlan> {
  try {
    const { browserApi, unwrapData } = await client()
    return { ok: true, plan: unwrapData(await browserApi().ai.prima({ params: book(), body: data })) }
  } catch (e) {
    return failure(e)
  }
}

/** Frase libre en Inicio cuando las reglas no entienden. */
export async function parseNL(text: string): Promise<ParsedNL> {
  try {
    const { browserApi, unwrapData } = await client()
    const r = unwrapData(await browserApi().ai.parse({ params: book(), body: { text } }))
    return r ? { ok: true, ...r } : { ok: false }
  } catch {
    return { ok: false }
  }
}
