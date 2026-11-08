// Genera y descarga el acuerdo de pago en PDF (lo usan el detalle de la deuda y el formulario al guardar).
import { apiMyProfile } from "./commands"
import type { LoanEngine } from "@/lib/domain"
import type { Row } from "@/lib/supabase/tables"
import { DOC_TIPOS, toAddress } from "@/features/contacts/contact-form"

export type AcuerdoInput = {
  kind: "cobrar" | "pagar"; hoy: string; user: { id: string; nombre: string }
  /** La otra persona (contacto guardado). */
  contact: Row<"contacts"> | null; nombre: string
  monto: number; concepto: string; inicio: string; plazo: number; frec: string; sistema: string; tasa: number; e: LoanEngine
}

export async function descargarAcuerdo(d: AcuerdoInput) {
  type Yo = { nombre: string; doc_tipo: string | null; doc: string | null; ciudad: string | null }
  const me: Yo | null = await apiMyProfile().catch(() => null)
  const { downloadAgreement } = await import("./agreement-pdf")
  const docOf = (t?: string | null, n?: string | null) => (n ? `${DOC_TIPOS.find((x) => x.value === t)?.value ?? "C.C."} ${n}` : "")
  const ad = toAddress(d.contact)
  await downloadAgreement({
    kind: d.kind, hoy: d.hoy, ciudad: me?.ciudad ?? "",
    yo: { nombre: me?.nombre || d.user.nombre, doc: docOf(me?.doc_tipo, me?.doc) },
    otro: { nombre: d.nombre, doc: docOf(d.contact?.doc_tipo, d.contact?.doc), direccion: [ad.dir, ad.ciudad].filter(Boolean).join(", "), telefono: d.contact?.telefono },
    monto: d.monto, concepto: d.concepto, inicio: d.inicio, plazo: d.plazo, frec: d.frec, sistema: d.sistema, tasa: d.tasa,
    ea: d.sistema === "simple" ? (d.tasa * 12) / 100 : Math.pow(1 + d.tasa / 100, 12) - 1, e: d.e,
  }, `acuerdo-de-pago-${d.nombre.toLowerCase().replace(/\s+/g, "-")}.pdf`)
}
