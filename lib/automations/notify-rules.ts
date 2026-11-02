// A quién y bajo qué tipo de aviso salen los avisos de una automatización (isomórfico: servidor y pruebas).
import type { AvisoKey } from "@/lib/notify/rules"
import type { TriggerKind } from "./types"

/**
 * Tipo de aviso de Ajustes › Alertas al que corresponde el disparador. Si lo hay, la automatización respeta la
 * matriz aviso × canal de cada persona (onFor): así "Recordatorio de pagos" o "Presupuesto al 80 %" no llegan por un
 * canal que la persona apagó para ese tipo de aviso.
 */
export function avisoDeDisparador(kind: TriggerKind | string, data: Record<string, unknown> = {}): AvisoKey | undefined {
  if (kind === "pago_proximo") return "pagos"
  if (kind === "presupuesto") return "presupuesto"
  if (kind === "hormiga") return "hormiga"
  if (kind === "meta_alcanzada") return "metas"
  if (kind === "cuota") return data.dir === "cobrar" ? "cobros" : "pagos"
  return undefined
}

/**
 * A quién llega: todo el hogar, quien hizo el movimiento ("autor") o una persona (user_id). Si la persona ya no está
 * en el hogar, llega a quien creó la automatización; si tampoco está, a todo el hogar.
 */
export function destinatarios(miembros: string[], o: { para?: string; autor?: string | null; creador?: string | null }) {
  const para = o.para || "hogar"
  if (para === "hogar") return miembros
  const quien = para === "autor" ? o.autor : para
  if (quien && miembros.includes(quien)) return [quien]
  if (o.creador && miembros.includes(o.creador)) return [o.creador]
  return miembros
}
