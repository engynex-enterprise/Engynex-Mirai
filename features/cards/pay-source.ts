// "¿Con qué pagaste?": un medio de pago (sale de tu cuenta hoy) o una tarjeta de crédito (es una compra con tarjeta:
// sube la deuda de la tarjeta y la plata sale cuando la pagas). Lo usan el correo del banco e importar extractos.
import type { Option } from "@/components/mirai/combobox"
import type { Row } from "@/lib/supabase/tables"

export type PaySource = { kind: "medio"; id: string | null } | { kind: "tarjeta"; id: string }

/** Opciones agrupadas: tarjetas de crédito y medios de pago (los medios "crédito" sobran si ya hay tarjetas). */
export function paySourceOptions(methods: Row<"payment_methods">[], cards: Pick<Row<"credit_cards">, "id" | "nombre">[]): Option[] {
  return [
    ...cards.map((c) => ({ value: `t:${c.id}`, label: `Tarjeta ${c.nombre}`, icon: "credit-card", group: "Tarjetas de crédito", hint: "Sube la deuda de la tarjeta" })),
    ...methods.filter((m) => !cards.length || !/cr[eé]dito/i.test(m.nombre)).map((m) => ({ value: `m:${m.id}`, label: m.nombre, icon: m.icon, group: "Medios de pago" })),
  ]
}

export function parsePaySource(v: string | null | undefined): PaySource {
  if (v?.startsWith("t:")) return { kind: "tarjeta", id: v.slice(2) }
  return { kind: "medio", id: v?.startsWith("m:") ? v.slice(2) : null }
}

/** Valor por defecto: si el texto del banco habla de tarjeta de crédito y tienes tarjetas, la primera; si no, el medio por defecto. */
export function defaultPaySource(texto: string, cards: Pick<Row<"credit_cards">, "id">[], medio?: string | null): string {
  if (cards.length && !/d[eé]bito/i.test(texto) && /cr[eé]dito|tarjeta|\bvisa\b|master|amex/i.test(texto)) return `t:${cards[0].id}`
  return medio ? `m:${medio}` : ""
}
