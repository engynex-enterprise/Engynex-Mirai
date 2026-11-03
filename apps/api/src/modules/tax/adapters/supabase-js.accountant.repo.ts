// Adaptador de hoy (PostgREST con la clave del sistema). El libro se arma con las mismas partes que loadBookData
// (BOOK_PARTS de @mirai/domain/book-data) y la Declaración con rentaDataFrom (@mirai/domain/integral-extras).
import { Injectable, Optional } from "@nestjs/common"
import type { PlanRow } from "@mirai/domain/app-context"
import { BOOK_PARTS, loadBookDataWith, SINGLE_ROW_PARTS, type BookPart, type PartRows } from "@mirai/domain/book-data"
import { rentaDataFrom, type AttachmentRow, type RentaData } from "@mirai/domain/integral-extras"
import { refPorAnio } from "@mirai/domain/payroll"
import type { DbScope } from "../../../core/db/scope"
import { SupabaseJsFactory } from "../../../core/db/supabase-js.factory"
import { DomainError } from "../../../core/errors/domain-error"
import { ObjectStore } from "../../../core/files/object-store"
import { AccountantRepo, type ShareRow } from "../accountant.repository"

@Injectable()
export class SupabaseJsAccountantRepo extends AccountantRepo {
  constructor(
    private readonly sb: SupabaseJsFactory,
    // V7-E: con OBJECT_STORE distinto de `supabase`, los adjuntos se firman en el puerto (gcs, s3, azure-blob).
    @Optional() private readonly files?: ObjectStore,
  ) {
    super()
  }

  async shareByHash(scope: DbScope, tokenHash: string) {
    const { data, error } = await this.sb.for(scope).from("accountant_shares").select("id,book_id,label,perms,expires_at,revoked_at,created_by,views").eq("token_hash", tokenHash).maybeSingle()
    if (error) throw DomainError.fromPg(error)
    return data as ShareRow | null
  }
  async ownerName(scope: DbScope, userId: string) {
    const { data } = await this.sb.for(scope).from("profiles").select("nombre").eq("id", userId).maybeSingle()
    return data?.nombre ?? null
  }
  async bookPlan(scope: DbScope, bookId: string): Promise<{ plan: PlanRow } | null> {
    const db = this.sb.for(scope)
    const { data: b } = await db.from("books").select("household_id").eq("id", bookId).maybeSingle()
    if (!b) return null
    const { data: id } = await db.rpc("household_plan", { h: b.household_id })
    const { data } = await db.from("plans").select("id,nombre,funciones,anuncios,limites,precio_mes").eq("id", (id as string | null) ?? "gratis").maybeSingle()
    return { plan: data }
  }
  async countView(scope: DbScope, share: Pick<ShareRow, "id" | "views">) {
    await this.sb.for(scope).from("accountant_shares").update({ views: (share.views ?? 0) + 1, last_access: new Date().toISOString() }).eq("id", share.id)
  }

  private async part(scope: DbScope, bookId: string, part: BookPart): Promise<PartRows> {
    let q = this.sb.for(scope).from(part as never).select(BOOK_PARTS[part].select).eq("book_id" as never, bookId as never)
    if (!SINGLE_ROW_PARTS.includes(part)) q = q.is("deleted_at" as never, null)
    const { data, error } = await q
    if (error) throw DomainError.fromPg(error)
    if (part === "book_settings" && !data?.length) throw DomainError.notFound("No encontramos los ajustes de este libro")
    return (data ?? []) as PartRows
  }

  async renta(scope: DbScope, bookId: string, ownerId: string | null): Promise<RentaData> {
    const db = this.sb.for(scope)
    const [book, { data: bk }, ref] = await Promise.all([
      loadBookDataWith((p) => this.part(scope, bookId, p)),
      db.from("books").select("household_id,created_by").eq("id", bookId).single(),
      Promise.all([db.from("ref_uvt").select("year,valor"), db.from("ref_smmlv").select("year,valor")])
        .then(([u, s]) => ({ uvt: refPorAnio(u.data), smmlv: refPorAnio(s.data) }))
        .catch(() => ({ uvt: {}, smmlv: {} })),
    ])
    if (!bk) throw DomainError.notFound("No encontramos ese libro.")
    const owner = ownerId ?? bk.created_by
    const [mem, cats, bienes, years, prof, atts, liab] = await Promise.all([
      db.from("family_members").select("*").eq("household_id", bk.household_id).is("deleted_at", null).order("sort").order("created_at"),
      db.from("income_categories").select("id,nombre").eq("book_id", bookId),
      db.from("tax_assets").select("*").eq("book_id", bookId).is("deleted_at", null).order("created_at"),
      db.from("tax_years").select("*").eq("book_id", bookId).is("deleted_at", null),
      owner ? db.from("profiles").select("nombre,digitos,doc").eq("id", owner).maybeSingle() : Promise.resolve({ data: null }),
      db.from("attachments").select("id,doc_key,year,nombre,size,mime,path,created_at").eq("book_id", bookId).is("deleted_at", null).not("doc_key", "is", null).eq("visible_contador", true).order("created_at"),
      db.from("liabilities").select("nombre,cod,valor,currency").eq("book_id", bookId).is("deleted_at", null),
    ])
    const perfil = prof.data as { nombre?: string | null; digitos?: string | null; doc?: string | null } | null
    const digitos = perfil?.digitos ?? ""
    const { data: fechas } = /^\d{2}$/.test(digitos) ? await db.from("ref_renta_calendar").select("year,regimen,fecha").eq("digitos", digitos) : { data: [] }
    return rentaDataFrom(book, {
      members: mem.data ?? [], incomeCategories: cats.data ?? [], bienes: bienes.data ?? [], years: years.data ?? [], perfil,
      fechas: (fechas ?? []) as RentaData["fechas"], attachments: (atts.data ?? []) as AttachmentRow[], liabilities: liab.data ?? [], ref,
    })
  }

  async notes(scope: DbScope, shareId: string) {
    const { data, error } = await this.sb.for(scope).from("accountant_notes").select("id,autor,texto,created_at").eq("share_id", shareId).is("deleted_at", null).order("created_at")
    if (error) throw DomainError.fromPg(error)
    return data ?? []
  }
  async addNote(scope: DbScope, n: { book_id: string; share_id: string; texto: string }) {
    const { error } = await this.sb.for(scope).from("accountant_notes").insert({ ...n, autor: "contador" })
    if (error) throw DomainError.fromPg(error)
  }
  async visibleAttachment(scope: DbScope, bookId: string, path: string) {
    const { data } = await this.sb.for(scope).from("attachments").select("id,visible_contador").eq("path", path).eq("book_id", bookId).is("deleted_at", null).maybeSingle()
    return !!data?.visible_contador
  }
  async signedUrl(scope: DbScope, path: string, seconds: number) {
    if (this.files && this.files.driver !== "supabase") return this.files.signDownload({ bucket: "attachments", key: path, ttlS: seconds }).catch(() => null)
    return (await this.sb.for(scope).storage.from("attachments").createSignedUrl(path, seconds)).data?.signedUrl ?? null
  }
}
