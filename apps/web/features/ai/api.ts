// IA de los formularios por la API (v6 F2-H-5, interruptor `ai`): POST /v1/books/:b/ai/*. Misma firma y misma forma
// de respuesta que las Server Actions de ./actions.ts; con el interruptor apagado son exactamente las de siempre.
// La API responde `{ ok:true, data }` y convierte los `{ ok:false, msg }` en ApiError con el MISMO texto: aquí se
// vuelven a armar como los devolvía la acción. Las fotos y PDF viajan en base64 (FileRef de @mirai/contracts).
import { failure, isApiError } from "@/lib/api/errors"
import { activeBookId, apiOn } from "@/lib/api/session"
import { viaApiOr } from "@/lib/api/via"
import type { FileRef } from "@mirai/contracts/modules/chat"
import * as actions from "./actions"

export type { ClassifyItem, ClassifyOut, LoanDocData } from "./actions"

const on = () => apiOn("ai")
/** viaApiOr con la forma de la respuesta fijada por la acción (la versión de la API tiene que devolver lo mismo). */
const wrap = <A extends unknown[], R>(action: (...a: A) => Promise<R>, api: (...a: A) => Promise<NoInfer<R>>) => viaApiOr(on, action, api)
const client = () => import("@/lib/api/client")
const book = () => ({ bookId: activeBookId() })

/** El rol lo revisaba la acción con requireRole (lanzaba): se sigue lanzando. Lo demás es un resultado. */
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

export const readInvoice = wrap(actions.readInvoice, async (fd) => {
  try {
    const file = await fileRefOf(fd)
    if (!file) return { ok: false as const, msg: NO_FILE }
    const { browserApi, unwrapData } = await client()
    return { ok: true as const, ...unwrapData(await browserApi().ai.invoice({ params: book(), body: { file } })) }
  } catch (e) {
    return failure(e)
  }
})

export const classifyExpenses = wrap(actions.classifyExpenses, async (items) => {
  try {
    const { browserApi, unwrapData } = await client()
    return unwrapData(await browserApi().ai.classify({ params: book(), body: { items } })).items
  } catch {
    // La acción devolvía null si el rol, el plan o la IA no dejaban: clasificar es opcional.
    return null
  }
})

export const reviewMonthHormiga = wrap(actions.reviewMonthHormiga, async (k) => {
  if (typeof k !== "string" || !/^\d{4}-\d{2}$/.test(k)) return { ok: false, msg: "Mes inválido." }
  try {
    const { browserApi, unwrapData } = await client()
    return { ok: true, msg: unwrapData(await browserApi().ai.hormiga({ params: book(), body: { mes: k } })).msg }
  } catch (e) {
    rethrowRole(e)
    return failure(e)
  }
})

export const suggestCategory = wrap(actions.suggestCategory, async (desc, nombre, icons) => {
  try {
    const { browserApi, unwrapData } = await client()
    const s = unwrapData(await browserApi().ai.category({ params: book(), body: { desc, nombre, icons } }))
    return s ? { ok: true, s } : { ok: false }
  } catch (e) {
    rethrowRole(e)
    return { ok: false }
  }
})

export const identifyEntity = wrap(actions.identifyEntity, async (q) => {
  try {
    const { browserApi, unwrapData } = await client()
    const s = unwrapData(await browserApi().ai.entity({ params: book(), body: { q } }))
    return s ? { ok: true, s } : { ok: false }
  } catch (e) {
    rethrowRole(e)
    return { ok: false }
  }
})

export const readLoanDoc = wrap(actions.readLoanDoc, async (fd, kind) => {
  try {
    const file = await fileRefOf(fd)
    if (!file) return { ok: false as const, msg: NO_FILE }
    const { browserApi, unwrapData } = await client()
    return { ok: true as const, d: unwrapData(await browserApi().ai.loanDoc({ params: book(), body: { file, kind } })) as actions.LoanDocData }
  } catch (e) {
    rethrowRole(e)
    return failure(e)
  }
})

export const readReceipt = wrap(actions.readReceipt, async (fd) => {
  try {
    const file = await fileRefOf(fd)
    if (!file) return { ok: false as const, msg: NO_FILE.replace("la imagen", "el comprobante") }
    const { browserApi, unwrapData } = await client()
    return { ok: true as const, ...unwrapData(await browserApi().ai.receipt({ params: book(), body: { file } })) }
  } catch (e) {
    rethrowRole(e)
    return failure(e)
  }
})

export const improveCobro = wrap(actions.improveCobro, async (msg, tono) => {
  try {
    const { browserApi, unwrapData } = await client()
    return { ok: true, text: unwrapData(await browserApi().ai.cobro({ params: book(), body: { msg, tono } })).text }
  } catch (e) {
    return { ok: false, text: failure(e).msg }
  }
})

export const primaPlan = wrap(actions.primaPlan, async (data) => {
  try {
    const { browserApi, unwrapData } = await client()
    return { ok: true, plan: unwrapData(await browserApi().ai.prima({ params: book(), body: data })) }
  } catch (e) {
    return failure(e)
  }
})

export const parseNL = wrap(actions.parseNL, async (text) => {
  try {
    const { browserApi, unwrapData } = await client()
    const r = unwrapData(await browserApi().ai.parse({ params: book(), body: { text } }))
    return r ? { ok: true, ...r } : { ok: false }
  } catch {
    return { ok: false }
  }
})
