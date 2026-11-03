// Lado del titular del acceso del contador (V7-G): crear, ver, rotar y quitar accesos, notas y documentos visibles.
// Mismas reglas y textos que createShare / rotateShare / revokeShare / ownerNote de apps/web/features/contador/actions.ts.
// Con el JWT de la persona (UserScope): la RLS vuelve a revisar «Administra» en accountant_shares y «Colabora» +
// autor 'titular' en accountant_notes. El token se genera aquí, se devuelve una vez y en la base solo queda su hash.
import { createHash, randomBytes } from "node:crypto"
import { Inject, Injectable } from "@nestjs/common"
import type { Logger } from "pino"
import type { OwnerShare } from "@mirai/contracts/modules/tax"
import { RequestContextService } from "../../core/context/request-context.service"
import { DomainError } from "../../core/errors/domain-error"
import { LOGGER } from "../../core/logging/logger"
import { RowStore } from "../../core/store/row-store"
import { HouseholdAccess } from "../households/household-access"
import { SiteUrl } from "../households/site-url"
import { AccountantMailer } from "./accountant-mailer"

export const hashToken = (t: string) => createHash("sha256").update(t).digest("hex")
const SHARE_COLS = ["id", "label", "email", "perms", "expires_at", "revoked_at", "views", "last_access", "created_at"] as const
const FILE_COLS = ["id", "nombre", "path", "mime", "size", "year", "doc_key", "visible_contador", "created_at"] as const
const NOT_FOUND = "Ese acceso ya no existe."

/** Fecha de vencimiento del acceso (30 o 90 días, 31 de diciembre de este año en Bogotá, o nunca). */
export function expiry(e: "30" | "90" | "dic" | "nunca", now = new Date()): string | null {
  if (e === "nunca") return null
  if (e === "dic") return new Date(`${now.getFullYear()}-12-31T23:59:00-05:00`).toISOString()
  return new Date(now.getTime() + Number(e) * 864e5).toISOString()
}

export const estadoDe = (s: { revoked_at: string | null; expires_at: string | null }, now = new Date()): OwnerShare["estado"] =>
  s.revoked_at ? "quitado" : s.expires_at && new Date(s.expires_at) < now ? "vencido" : "activo"

type ShareRow = Omit<OwnerShare, "estado">
type FileRow = { id: string; nombre: string; path: string; mime: string; size: number; year: number | null; doc_key: string | null; visible_contador: boolean; created_at: string }

@Injectable()
export class AccountantOwnerService {
  constructor(
    private readonly store: RowStore,
    private readonly mailer: AccountantMailer,
    private readonly access: HouseholdAccess,
    private readonly site: SiteUrl,
    private readonly ctx: RequestContextService,
    @Inject(LOGGER) private readonly log: Logger,
  ) {}

  private get bookId() {
    return this.ctx.book.book.id
  }

  private url(token: string) {
    return this.site.to(`/contador/${token}`)
  }

  async shares(): Promise<OwnerShare[]> {
    const rows = await this.store.select<ShareRow>(this.ctx.db, "accountant_shares", { columns: SHARE_COLS, eq: { book_id: this.bookId }, order: [{ column: "created_at", ascending: false }] })
    return rows.map((s) => ({ ...s, email: s.email || null, views: Number(s.views ?? 0), estado: estadoDe(s) }))
  }

  async create(input: { label: string; email: string; perms: "renta" | "todo"; exp: "30" | "90" | "dic" | "nunca" }) {
    const token = randomBytes(24).toString("base64url")
    const [row] = await this.store.insert<{ id: string }>(this.ctx.db, "accountant_shares", [{
      book_id: this.bookId, label: input.label, email: input.email, perms: input.perms, token_hash: hashToken(token), expires_at: expiry(input.exp), created_by: this.ctx.user.id,
    }])
    const url = this.url(token)
    let enviado = false
    if (input.email) {
      try {
        const { user } = await this.access.actor()
        enviado = await this.mailer.send({ householdId: this.ctx.book.household.id, to: input.email, owner: user.nombre, url })
      } catch (e) {
        // El acceso ya quedó creado: si el correo falla, la persona copia el enlace (como la web).
        this.log.warn({ err: (e as Error).message }, "correo del contador sin enviar")
      }
    }
    return { id: row.id, url, enviado, msg: enviado ? `Le enviamos el enlace a ${input.email}.` : `Copia el enlace y envíaselo a ${input.label} por un medio seguro.` }
  }

  async rotate(shareId: string) {
    const token = randomBytes(24).toString("base64url")
    const rows = await this.store.update(this.ctx.db, "accountant_shares", { eq: { id: shareId, book_id: this.bookId } }, { token_hash: hashToken(token), revoked_at: null })
    if (!rows.length) throw DomainError.notFound(NOT_FOUND)
    return { url: this.url(token) }
  }

  async revoke(shareId: string) {
    const rows = await this.store.update<ShareRow>(this.ctx.db, "accountant_shares", { eq: { id: shareId, book_id: this.bookId } }, { revoked_at: new Date().toISOString() })
    if (!rows.length) throw DomainError.notFound(NOT_FOUND)
    return { msg: `${rows[0].label} ya no puede entrar.` }
  }

  notes() {
    return this.store.select<{ id: string; share_id: string; autor: string; texto: string; created_at: string }>(this.ctx.db, "accountant_notes", {
      columns: ["id", "share_id", "autor", "texto", "created_at"], eq: { book_id: this.bookId, deleted_at: null }, order: [{ column: "created_at" }],
    })
  }

  async addNote(shareId: string, texto: string) {
    // El acceso tiene que ser de este mismo libro (si no, la nota aparecería en el portal de otro hogar).
    const share = await this.store.first(this.ctx.db, "accountant_shares", { columns: ["id"], eq: { id: shareId, book_id: this.bookId } })
    if (!share) throw DomainError.notFound(NOT_FOUND)
    await this.store.insert(this.ctx.db, "accountant_notes", [{ book_id: this.bookId, share_id: shareId, autor: "titular", texto: texto.trim().slice(0, 2000), created_by: this.ctx.user.id }])
    return { saved: true }
  }

  async files(todos: boolean): Promise<FileRow[]> {
    const rows = await this.store.select<FileRow>(this.ctx.db, "attachments", {
      columns: FILE_COLS, eq: { book_id: this.bookId, deleted_at: null, ...(todos ? {} : { visible_contador: true }) }, order: [{ column: "created_at", ascending: false }],
    })
    return rows.map((f) => ({ ...f, size: Number(f.size ?? 0) }))
  }

  async setFileVisible(attachmentId: string, visible: boolean): Promise<FileRow> {
    const rows = await this.store.update<FileRow>(this.ctx.db, "attachments", { eq: { id: attachmentId, book_id: this.bookId, deleted_at: null } }, { visible_contador: visible })
    if (!rows.length) throw DomainError.notFound("No encontramos ese documento.")
    const f = rows[0]
    return Object.fromEntries(FILE_COLS.map((k) => [k, k === "size" ? Number(f.size ?? 0) : f[k]])) as FileRow
  }
}
