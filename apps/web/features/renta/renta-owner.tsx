"use client"

import { useQueryClient } from "@tanstack/react-query"
import { useQuery } from "@/lib/query"
import { fileUrl, uploadFile } from "@/lib/files/upload"
import { toast } from "@/components/mirai/toast"
import { PageSkeleton } from "@/components/skeletons/page-skeleton"
import { useApp, useBookId, useCanEdit } from "@/components/app/app-context"
import { conv } from "@/lib/domain"
import { qk } from "@/lib/supabase/tables"
import { fetchRentaData } from "./data"
import { insertRentaRows, saveRentaMember, saveRentaRow, saveRentaUvt, saveTaxYear, setRentaDeleted } from "./api"
import { RentaView, type RentaActions } from "./renta-view"

/** Declaración de renta del titular: lee y escribe por la API (./api.ts y fetchRentaData). */
export function RentaOwner() {
  const bookId = useBookId()
  const { household } = useApp()
  const canEdit = useCanEdit()
  const qc = useQueryClient()
  const key = qk(bookId, "renta")
  const { data } = useQuery({ queryKey: key, queryFn: () => fetchRentaData(bookId) })
  if (!data) return <PageSkeleton kpis={3} />
  const done = () => qc.invalidateQueries({ queryKey: key })

  const actions: RentaActions = {
    async saveTax(y, mid, patch) {
      const cur = data.years.find((x) => x.year === y && x.member_id === mid)
      await saveTaxYear(bookId, { year: y, member_id: mid, ing: patch.ing ?? cur?.ing ?? {}, ded: patch.ded ?? cur?.ded ?? {}, docs: patch.docs ?? cur?.docs ?? {}, consig: patch.consig ?? cur?.consig ?? 0, consumos: patch.consumos ?? cur?.consumos ?? 0 }, cur?.id)
      toast("Guardado"); done()
    },
    async saveUvt(y, v) { await saveRentaUvt(bookId, { ...data.settings.uvt, [y]: v }); toast("UVT actualizada"); done() },
    async saveBien(b) {
      const row = { tipo: b.tipo, nombre: b.nombre, ident: b.ident ?? "", entidad: b.entidad ?? "", costo: b.costo, avaluo: b.avaluo, valor31: b.valor31, fecha_adq: b.fecha_adq ?? null, member_id: b.member_id || null, pct: b.pct, predial: b.predial ?? null, imp_veh: b.imp_veh ?? null, soat: b.soat ?? null, asset_id: b.asset_id ?? null }
      await saveRentaRow(bookId, "tax_assets", row, b.id || null); done()
    },
    async delBien(id, nombre) {
      await setRentaDeleted(bookId, "tax_assets", id, true); done()
      toast("Bien eliminado", { description: `“${nombre}”`, action: { label: "Deshacer", onClick: async () => { await setRentaDeleted(bookId, "tax_assets", id, false); done() } } })
    },
    async importBienes() {
      const linked = new Set(data.bienes.map((b) => b.asset_id).filter(Boolean))
      const tit = data.members.find((m) => m.es_titular)?.id ?? data.members[0]?.id ?? null
      const nuevos = data.book.assets.filter((a) => !/^11/.test(a.cod) && !linked.has(a.id))
      await insertRentaRows(bookId, "tax_assets", nuevos.map((a) => ({ asset_id: a.id, tipo: a.cod === "1516" ? "inmueble" : a.cod === "1540" ? "vehiculo" : "otro", nombre: a.nombre, costo: conv(a.valor, a.currency, data.book.settings.trm), pct: 100, member_id: tit })))
      done(); return nuevos.length
    },
    async saveMember(id, patch) { await saveRentaMember(household.id, id, patch); done(); qc.invalidateQueries({ queryKey: ["h", household.id, "family_members"] }) },
    async upload(y, docKey, f) {
      // Sube por la API a {libro}/renta/{año}/… (la API revisa rol, tamaño y tipo).
      const path = (await uploadFile({ bucket: "attachments", body: f, name: f.name, bookId, folder: `renta/${y}` })).key
      await saveRentaRow(bookId, "attachments", { doc_key: docKey, year: y, path, nombre: f.name, mime: f.type || "application/octet-stream", size: f.size, ref_table: "tax_years" })
      done()
    },
    async delAttachment(id) { await setRentaDeleted(bookId, "attachments", id, true); done() },
  }
  return <RentaView data={data} actions={canEdit ? actions : null} fileUrl={async (p) => fileUrl("attachments", p).catch(() => null)} />
}
