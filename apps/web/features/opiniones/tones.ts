import type { IconTone } from "@/components/mirai/tone-icon"
import type { FeedbackTipo } from "@/lib/content/opiniones"

/** Color de referencia de cada tipo de opinión (mismo en la página, el Centro de ayuda y los atajos). */
export const TIPO_TONE: Record<FeedbackTipo, IconTone> = {
  calificacion: "amber", error: "red", funcion: "blue", sugerencia: "violet", elogio: "green", pregunta: "navy", soporte: "brand", otro: "gray",
}
