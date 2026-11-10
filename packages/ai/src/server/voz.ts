// Dictado por voz cuando el navegador no lo trae (Firefox, algunas apps instaladas en iPhone): el navegador graba,
// convierte a WAV (features/chat/voice.ts) y la IA lo pasa a texto. Va por aiText (plan, créditos, límites y registro en
// ai_usage como todo). Los proveedores que no oyen audio fallan y run() prueba el siguiente. Solo servidor.
import { aiText, AiUnavailable, filePart } from "../run"
import { whoOf, type AiCtx } from "./ctx"
import type { AiFile } from "./ai-actions"

/** Audio aceptado (el navegador manda WAV; se aceptan los formatos comunes por si acaso) y su tope (~2 min en WAV de 16 kHz). */
export const AUDIO_TYPES = /^audio\/(wav|x-wav|wave|ogg|mpeg|mp3|aac|flac|webm|mp4)$/
export const AUDIO_MAX = 5 * 1024 * 1024

/** null = el audio sirve; si no, el mensaje para la persona. */
export function audioProblem(f: AiFile | null | undefined): string | null {
  if (!f || !f.size) return "No llegó el audio. Intenta de nuevo."
  if (f.size > AUDIO_MAX) return "El audio es muy largo. Dicta en partes de máximo 2 minutos."
  if (!AUDIO_TYPES.test(f.type.split(";")[0])) return "Formato de audio no soportado."
  return null
}

export type TranscribeResult = { ok: true; text: string } | { ok: false; msg: string }

/** Lo que dijo la persona, en texto. */
export async function transcribeWith(ctx: AiCtx, f: AiFile): Promise<TranscribeResult> {
  try {
    const { text } = await aiText({
      ...whoOf(ctx), feature: "voz", cache: false,
      messages: [{ role: "user", content: [filePart({ data: f.data, mediaType: f.type.split(";")[0] }), { type: "text", text: "Transcribe el audio." }] }],
    })
    return { ok: true, text: text.replace(/^["“«\s]+|["”»\s]+$/g, "").trim().slice(0, 4000) }
  } catch (e) {
    return { ok: false, msg: e instanceof AiUnavailable ? e.message : "No pude pasar tu voz a texto. Intenta de nuevo o escribe tu mensaje." }
  }
}
