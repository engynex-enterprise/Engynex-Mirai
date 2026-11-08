// Opiniones y soporte por la API: POST /v1/feedback, GET /v1/me/feedback y DELETE /v1/me/feedback/:id.
// La captura sube por `files` (bucket `feedback`, carpeta de la persona).
import type { Row } from "@mirai/db/tables"
import { uploadFile } from "@/lib/files/upload"

export type FeedbackRow = Row<"feedback">
export type NewFeedback = {
  tipo: string
  rating?: number | null
  mensaje: string
  captura?: string | null
  household_id: string
  pagina: string | null
  contexto: Record<string, unknown>
}

const api = async () => {
  const { browserApi, unwrap, unwrapData } = await import("@/lib/api/client")
  return { f: browserApi().feedback, unwrap, unwrapData }
}

/** Mis opiniones y casos (la más reciente primero). */
export async function loadMyFeedback(): Promise<FeedbackRow[]> {
  const { f, unwrap } = await api()
  return unwrap(await f.mine()) as FeedbackRow[]
}

/** Envía una opinión o un caso de soporte. Devuelve el id (número de caso). Lanza con el mensaje para la persona. */
export async function sendFeedback(v: NewFeedback): Promise<string> {
  const { f, unwrapData } = await api()
  const body = { tipo: v.tipo as never, rating: v.rating ?? null, mensaje: v.mensaje, captura: v.captura ?? null, householdId: v.household_id, pagina: v.pagina, contexto: v.contexto }
  return unwrapData(await f.send({ body })).id
}

/** Borra una opinión propia que aún no se revisa. */
export async function deleteFeedback(id: string): Promise<void> {
  const { f, unwrapData } = await api()
  unwrapData(await f.remove({ params: { feedbackId: id } }))
}

/** Sube la captura de una opinión y devuelve su ruta en el bucket `feedback` (`<persona>/<archivo>`). */
export async function uploadCaptura(file: File): Promise<string> {
  return (await uploadFile({ bucket: "feedback", body: file, name: file.name })).key
}

/** Desde cuándo tiene cuenta la persona (la tarjeta para calificar espera 7 días de uso). */
export async function profileSince(): Promise<string | null> {
  const { browserApi, unwrap } = await import("@/lib/api/client")
  return unwrap(await browserApi().me.profile()).created_at ?? null
}
