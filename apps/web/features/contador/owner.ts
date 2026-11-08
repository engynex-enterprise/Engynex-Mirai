// Lado del titular del acceso del contador por la API: accesos y notas (GET /v1/books/:b/accountant/{shares,notes}),
// crear, enlace nuevo, quitar y nota del titular.
import { activeBookId } from "@/lib/api/session"
import { errorMsg } from "@/lib/api/errors"
import type { NewShare } from "./types"

const api = () => import("@/lib/api/client")

export type OwnerShareRow = { id: string; label: string; email: string | null; perms: string; expires_at: string | null; revoked_at: string | null; views: number; last_access: string | null; created_at: string }
export type OwnerNoteRow = { id: string; share_id: string; autor: string; texto: string; created_at: string }

/** Accesos del libro (del más reciente) y sus notas (en orden). */
export async function fetchOwnerData(bookId: string): Promise<{ shares: OwnerShareRow[]; notes: OwnerNoteRow[] }> {
  const { browserApi, unwrap } = await api()
  const a = browserApi()
  const [s, n] = await Promise.all([a.accountantOwner.shares({ params: { bookId } }), a.accountantOwner.notes({ params: { bookId } })])
  return { shares: unwrap(s) as OwnerShareRow[], notes: unwrap(n) }
}

/** Crea un acceso: `{ ok, msg, url? }` (el enlace sale una sola vez). */
export async function createShare(input: NewShare): Promise<{ ok: boolean; msg: string; url?: string }> {
  try {
    const { browserApi, unwrapData } = await api()
    const r = unwrapData(await browserApi().accountantOwner.createShare({ params: { bookId: activeBookId() }, body: input }))
    return { ok: true, msg: r.msg, url: r.url }
  } catch (e) {
    return { ok: false, msg: errorMsg(e) }
  }
}

/** Enlace nuevo (el anterior deja de servir). Lanza Error con el mensaje. */
export async function rotateShare(id: string): Promise<string> {
  const { browserApi, unwrapData } = await api()
  return unwrapData(await browserApi().accountantOwner.rotateShare({ params: { bookId: activeBookId(), shareId: id } })).url
}

/** Quita el acceso. */
export async function revokeShare(id: string): Promise<void> {
  const { browserApi, unwrapData } = await api()
  unwrapData(await browserApi().accountantOwner.revokeShare({ params: { bookId: activeBookId(), shareId: id } }))
}

/** Nota del titular para un acceso de este libro. */
export async function ownerNote(shareId: string, texto: string): Promise<void> {
  if (!texto.trim()) return
  const { browserApi, unwrapData } = await api()
  unwrapData(await browserApi().accountantOwner.addNote({ params: { bookId: activeBookId() }, body: { shareId, texto } }))
}
