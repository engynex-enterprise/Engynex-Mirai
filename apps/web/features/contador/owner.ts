// Lado del titular del acceso del contador por la API (V7-H2, interruptor `accountant`): accesos y notas
// (GET /v1/books/:b/accountant/{shares,notes}), crear, enlace nuevo, quitar y nota del titular. Misma firma y misma
// forma de respuesta que las Server Actions de ./actions.ts y las lecturas de siempre; apagado es exactamente lo de
// hoy (las acciones y Supabase directo: rama heredada). Las escrituras nunca se repiten por el otro camino.
import { activeBookId, apiOn } from "@/lib/api/session"
import { readWithFallback } from "@/lib/api/book-tables"
import { viaApiOr } from "@/lib/api/via"
import { errorMsg } from "@/lib/api/errors"
import { createClient } from "@/utils/supabase/client"
import * as actions from "./actions"

const on = () => apiOn("accountant")
const api = () => import("@/lib/api/client")

export type OwnerShareRow = { id: string; label: string; email: string | null; perms: string; expires_at: string | null; revoked_at: string | null; views: number; last_access: string | null; created_at: string }
export type OwnerNoteRow = { id: string; share_id: string; autor: string; texto: string; created_at: string }

/** Accesos del libro (del más reciente) y sus notas (en orden). */
export async function fetchOwnerData(bookId: string): Promise<{ shares: OwnerShareRow[]; notes: OwnerNoteRow[] }> {
  const legacy = async () => {
    const sb = createClient()
    const [{ data: shares }, { data: notes }] = await Promise.all([
      sb.from("accountant_shares").select("id,label,email,perms,expires_at,revoked_at,views,last_access,created_at").eq("book_id", bookId).order("created_at", { ascending: false }),
      sb.from("accountant_notes").select("id,share_id,autor,texto,created_at").eq("book_id", bookId).is("deleted_at", null).order("created_at"),
    ])
    return { shares: (shares ?? []) as OwnerShareRow[], notes: (notes ?? []) as OwnerNoteRow[] }
  }
  if (!on()) return legacy()
  return readWithFallback(async () => {
    const { browserApi, unwrap } = await api()
    const a = browserApi()
    const [s, n] = await Promise.all([a.accountantOwner.shares({ params: { bookId } }), a.accountantOwner.notes({ params: { bookId } })])
    return { shares: unwrap(s) as OwnerShareRow[], notes: unwrap(n) }
  }, legacy)
}

/** Crea un acceso: `{ ok, msg, url? }` como la acción (el enlace sale una sola vez). */
export const createShare = viaApiOr(on, actions.createShare, async (input) => {
  try {
    const { browserApi, unwrapData } = await api()
    const r = unwrapData(await browserApi().accountantOwner.createShare({ params: { bookId: activeBookId() }, body: input }))
    return { ok: true, msg: r.msg, url: r.url }
  } catch (e) {
    return { ok: false, msg: errorMsg(e) }
  }
})

/** Enlace nuevo (el anterior deja de servir). Lanza Error con el mensaje, como la acción. */
export const rotateShare = viaApiOr(on, actions.rotateShare, async (id) => {
  const { browserApi, unwrapData } = await api()
  return unwrapData(await browserApi().accountantOwner.rotateShare({ params: { bookId: activeBookId(), shareId: id } })).url
})

/** Quita el acceso. */
export const revokeShare = viaApiOr(on, actions.revokeShare, async (id) => {
  const { browserApi, unwrapData } = await api()
  unwrapData(await browserApi().accountantOwner.revokeShare({ params: { bookId: activeBookId(), shareId: id } }))
})

/** Nota del titular para un acceso de este libro. */
export const ownerNote = viaApiOr(on, actions.ownerNote, async (shareId, texto) => {
  if (!texto.trim()) return
  const { browserApi, unwrapData } = await api()
  unwrapData(await browserApi().accountantOwner.addNote({ params: { bookId: activeBookId() }, body: { shareId, texto } }))
})
