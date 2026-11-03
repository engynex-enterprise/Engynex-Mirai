"use client"

import { useQuery, useQueryClient } from "@tanstack/react-query"
import { fileUrl, filesViaApi, uploadFile } from "@/lib/files/upload"
import { toast } from "@/components/mirai/toast"
import { PageSkeleton } from "@/components/skeletons/page-skeleton"
import { useApp, useBookId, useCanEdit } from "@/components/app/app-context"
import { createClient } from "@/utils/supabase/client"
import { conv } from "@/lib/domain"
import { qk } from "@/lib/supabase/tables"
import { loadRentaData } from "./data"
import { RentaView, type RentaActions } from "./renta-view"

/** Declaración de renta del titular: carga con RLS y escribe con el cliente del navegador. */
export function RentaOwner() {
  const bookId = useBookId()
  const { user, household } = useApp()
  const canEdit = useCanEdit()
  const qc = useQueryClient()
  const key = qk(bookId, "renta")
  const { data } = useQuery({ queryKey: key, queryFn: () => loadRentaData(createClient(), bookId, user.id) })
  if (!data) return <PageSkeleton kpis={3} />
  const sb = createClient()
  const done = () => qc.invalidateQueries({ queryKey: key })
  const chk = (r: { error: { message: string } | null }) => { if (r.error) throw new Error(r.error.message) }

  const actions: RentaActions = {
    async saveTax(y, mid, patch) {
      const cur = data.years.find((x) => x.year === y && x.member_id === mid)
      chk(await sb.from("tax_years").upsert({ book_id: bookId, year: y, member_id: mid, ing: (patch.ing ?? cur?.ing ?? {}) as never, ded: (patch.ded ?? cur?.ded ?? {}) as never, docs: (patch.docs ?? cur?.docs ?? {}) as never, consig: patch.consig ?? cur?.consig ?? 0, consumos: patch.consumos ?? cur?.consumos ?? 0 }, { onConflict: "book_id,year,member_id" }))
      toast("Guardado"); done()
    },
    async saveUvt(y, v) { chk(await sb.from("book_settings").update({ uvt: { ...data.settings.uvt, [y]: v } }).eq("book_id", bookId)); toast("UVT actualizada"); done() },
    async saveBien(b) {
      const row = { book_id: bookId, tipo: b.tipo, nombre: b.nombre, ident: b.ident ?? "", entidad: b.entidad ?? "", costo: b.costo, avaluo: b.avaluo, valor31: b.valor31, fecha_adq: b.fecha_adq ?? null, member_id: b.member_id || null, pct: b.pct, predial: b.predial ?? null, imp_veh: b.imp_veh ?? null, soat: b.soat ?? null, asset_id: b.asset_id ?? null }
      chk(b.id ? await sb.from("tax_assets").update(row).eq("id", b.id) : await sb.from("tax_assets").insert(row)); done()
    },
    async delBien(id, nombre) {
      chk(await sb.from("tax_assets").update({ deleted_at: new Date().toISOString() }).eq("id", id)); done()
      toast("Bien eliminado", { description: `“${nombre}”`, action: { label: "Deshacer", onClick: async () => { await sb.from("tax_assets").update({ deleted_at: null }).eq("id", id); done() } } })
    },
    async importBienes() {
      const linked = new Set(data.bienes.map((b) => b.asset_id).filter(Boolean))
      const tit = data.members.find((m) => m.es_titular)?.id ?? data.members[0]?.id ?? null
      const nuevos = data.book.assets.filter((a) => !/^11/.test(a.cod) && !linked.has(a.id))
      if (nuevos.length) chk(await sb.from("tax_assets").insert(nuevos.map((a) => ({ book_id: bookId, asset_id: a.id, tipo: a.cod === "1516" ? "inmueble" : a.cod === "1540" ? "vehiculo" : "otro", nombre: a.nombre, costo: conv(a.valor, a.currency, data.book.settings.trm), pct: 100, member_id: tit }))))
      done(); return nuevos.length
    },
    async saveMember(id, patch) { chk(await sb.from("family_members").update(patch as never).eq("id", id)); done(); qc.invalidateQueries({ queryKey: ["h", household.id, "family_members"] }) },
    async upload(y, docKey, f) {
      // v7 (interruptor `files`): sube por la API a {libro}/renta/{año}/… (la API revisa rol, tamaño y tipo).
      let path: string
      if (filesViaApi()) path = (await uploadFile({ bucket: "attachments", body: f, name: f.name, bookId, folder: `renta/${y}` })).key
      else {
        path = `${bookId}/renta/${y}/${crypto.randomUUID()}-${f.name.replace(/[^\w.\-]+/g, "_")}`
        chk(await sb.storage.from("attachments").upload(path, f, { contentType: f.type }))
      }
      chk(await sb.from("attachments").insert({ book_id: bookId, doc_key: docKey, year: y, path, nombre: f.name, mime: f.type || "application/octet-stream", size: f.size, ref_table: "tax_years" }))
      done()
    },
    async delAttachment(id) { chk(await sb.from("attachments").update({ deleted_at: new Date().toISOString() }).eq("id", id)); done() },
  }
  return <RentaView data={data} actions={canEdit ? actions : null} fileUrl={async (p) => (filesViaApi() ? fileUrl("attachments", p).catch(() => null) : (await sb.storage.from("attachments").createSignedUrl(p, 300)).data?.signedUrl ?? null)} />
}
