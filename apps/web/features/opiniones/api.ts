// Opiniones y soporte por la API (V7-H3, interruptor `feedback`): POST /v1/feedback, GET /v1/me/feedback y
// DELETE /v1/me/feedback/:id. La captura sube por `files` (bucket `feedback`, carpeta de la persona).
// Con el interruptor apagado es exactamente lo de siempre (modo heredado: `feedback` y Storage directo con la sesión de
// Supabase; son las únicas ramas con `.from`/`.storage` de esta carpeta). Lecturas con respaldo; escrituras sin él.
import type { Row } from "@mirai/db/tables"
import { readWithFallback } from "@/lib/api/book-tables"
import { apiOn } from "@/lib/api/session"
import { filesViaApi, uploadFile } from "@/lib/files/upload"
import { createClient } from "@/utils/supabase/client"

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

const on = () => apiOn("feedback")
const api = async () => {
  const { browserApi, unwrap, unwrapData } = await import("@/lib/api/client")
  return { f: browserApi().feedback, unwrap, unwrapData }
}

/** Mis opiniones y casos (la más reciente primero). */
export async function loadMyFeedback(userId: string): Promise<FeedbackRow[]> {
  const legacy = async () => {
    const { data, error } = await createClient().from("feedback").select("*").eq("user_id", userId).order("created_at", { ascending: false })
    if (error) throw new Error(error.message)
    return data
  }
  if (!on()) return legacy()
  return readWithFallback(async () => {
    const { f, unwrap } = await api()
    return unwrap(await f.mine()) as FeedbackRow[]
  }, legacy)
}

/** Envía una opinión o un caso de soporte. Devuelve el id (número de caso). Lanza con el mensaje para la persona. */
export async function sendFeedback(v: NewFeedback): Promise<string> {
  if (on()) {
    const { f, unwrapData } = await api()
    const body = { tipo: v.tipo as never, rating: v.rating ?? null, mensaje: v.mensaje, captura: v.captura ?? null, householdId: v.household_id, pagina: v.pagina, contexto: v.contexto }
    return unwrapData(await f.send({ body })).id
  }
  const { data, error } = await createClient().from("feedback").insert({
    tipo: v.tipo, rating: v.rating ?? null, mensaje: v.mensaje, captura: v.captura ?? null, household_id: v.household_id, pagina: v.pagina, contexto: v.contexto as never,
  }).select("id").single()
  if (error) throw new Error(error.message)
  return data.id
}

/** Borra una opinión propia que aún no se revisa. */
export async function deleteFeedback(id: string): Promise<void> {
  if (on()) {
    const { f, unwrapData } = await api()
    unwrapData(await f.remove({ params: { feedbackId: id } }))
    return
  }
  const { error } = await createClient().from("feedback").delete().eq("id", id)
  if (error) throw new Error(error.message)
}

/** Sube la captura de una opinión y devuelve su ruta en el bucket `feedback` (`<persona>/<archivo>`). */
export async function uploadCaptura(userId: string, file: File): Promise<string> {
  if (filesViaApi()) return (await uploadFile({ bucket: "feedback", body: file, name: file.name })).key
  const path = `${userId}/${crypto.randomUUID()}.${(file.name.split(".").pop() || "png").toLowerCase().replace(/[^a-z0-9]/g, "")}`
  const up = await createClient().storage.from("feedback").upload(path, file, { contentType: file.type, upsert: false })
  if (up.error) throw new Error(up.error.message)
  return path
}

/** Desde cuándo tiene cuenta la persona (la tarjeta para calificar espera 7 días de uso). */
export async function profileSince(userId: string): Promise<string | null> {
  const legacy = async () => (await createClient().from("profiles").select("created_at").eq("id", userId).single()).data?.created_at ?? null
  if (!apiOn("me")) return legacy()
  return readWithFallback(async () => {
    const { browserApi, unwrap } = await import("@/lib/api/client")
    return unwrap(await browserApi().me.profile()).created_at ?? null
  }, legacy)
}
