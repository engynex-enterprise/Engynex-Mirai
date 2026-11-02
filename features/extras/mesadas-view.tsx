"use client"

import Link from "next/link"
import { useMemo, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { Minus, Plus } from "lucide-react"
import { toast } from "@/components/mirai/toast"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Progress } from "@/components/ui/progress"
import { PageHeader } from "@/components/mirai/page-header"
import { Money } from "@/components/mirai/money"
import { MoneyInput } from "@/components/mirai/money-input"
import { MoneyAutosave } from "@/components/mirai/money-autosave"
import { Segmented } from "@/components/mirai/choice-cards"
import { FormField } from "@/components/mirai/field"
import { EmptyState } from "@/components/mirai/empty-state"
import { PageSkeleton } from "@/components/skeletons/page-skeleton"
import { initials } from "@/components/app/app-sidebar"
import { useBookId, useCanEdit } from "@/components/app/app-context"
import { invalidateBook, useList } from "@/hooks/use-book-data"
import { createClient } from "@/utils/supabase/client"
import { fmtDate, fmtMoney, todayISO } from "@/lib/format"
import { cn } from "@/lib/utils"
import type { Row } from "@/lib/supabase/tables"
import { useMembers } from "@/features/catalogs/hooks"
import { avatarTone } from "@/features/contacts/contacts-view"

const NO_HIJO = /titular|c[oó]nyuge|esposa|esposo|pareja/i

function KidCard({ m, a, movs, canEdit }: { m: Row<"family_members">; a: Row<"allowances"> | undefined; movs: Row<"allowance_movements">[]; canEdit: boolean }) {
  const bookId = useBookId()
  const qc = useQueryClient()
  const sb = createClient()
  const [desc, setDesc] = useState("")
  const [valor, setValor] = useState(0)
  const saldo = movs.reduce((s, x) => s + Number(x.valor), 0)
  const refresh = () => { invalidateBook(qc, bookId, "allowances"); invalidateBook(qc, bookId, "allowance_movements") }
  const ensure = async () => {
    if (a) return a.id
    const { data } = await sb.from("allowances").insert({ book_id: bookId, member_id: m.id }).select("id").single()
    return data!.id
  }
  const upd = async (p: Partial<Row<"allowances">>) => { const id = await ensure(); await sb.from("allowances").update(p).eq("id", id); refresh() }
  const mov = async (signo: 1 | -1, d: string, v: number) => {
    if (!v) return toast.error("Escribe el valor")
    const id = await ensure()
    await sb.from("allowance_movements").insert({ book_id: bookId, allowance_id: id, fecha: todayISO(), descripcion: d || (signo > 0 ? "Mesada" : "Gasto"), valor: signo * Math.abs(v) })
    toast.success(signo > 0 ? "Mesada entregada" : "Gasto anotado"); setDesc(""); setValor(0); refresh()
  }
  const metaV = Number(a?.meta_valor ?? 0)
  return (
    <Card className="gap-4 p-5 shadow-card ring-0">
      <div className="flex items-center gap-3">
        <Avatar className="size-11"><AvatarFallback className={cn("bg-gradient-to-br text-sm text-white", avatarTone(m.nombre))}>{initials(m.nombre)}</AvatarFallback></Avatar>
        <div className="grid flex-1"><b>{m.nombre}</b><span className="text-sm text-muted-foreground">{m.rol}</span></div>
        <div className="text-right"><p className="text-xs text-muted-foreground">Tiene</p><Money value={saldo} className="text-lg font-bold text-success" /></div>
      </div>
      {canEdit && (
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Mesada"><MoneyAutosave value={Number(a?.mesada ?? 20000)} onSave={(v) => upd({ mesada: v })} /></FormField>
          <FormField label="¿Cada cuánto?"><Segmented value={a?.frec ?? "semanal"} onChange={(v) => upd({ frec: v })} items={[{ value: "semanal", label: "Semanal" }, { value: "quincenal", label: "Quincenal" }, { value: "mensual", label: "Mensual" }]} /></FormField>
        </div>
      )}
      {canEdit && <Button variant="soft" className="w-fit" onClick={() => mov(1, "Mesada", Number(a?.mesada ?? 20000))}><Plus /> Entregar mesada de {fmtMoney(Number(a?.mesada ?? 20000))}</Button>}
      <div className="grid gap-2 rounded-lg bg-muted p-3">
        <p className="text-sm font-semibold">Su meta de ahorro</p>
        {canEdit && <div className="grid gap-2 sm:grid-cols-2"><Input className="h-10" placeholder="Ej. Una bicicleta" defaultValue={a?.meta_nombre ?? ""} onBlur={(e) => upd({ meta_nombre: e.target.value })} /><MoneyAutosave value={metaV} onSave={(v) => upd({ meta_valor: v })} placeholder="Valor de la meta" /></div>}
        {metaV > 0 && <><Progress value={Math.min(100, (saldo / metaV) * 100)} className="h-2 [&>div]:bg-lime" /><p className="text-sm">{saldo >= metaV ? "¡Meta cumplida! 🎉" : `Le faltan ${fmtMoney(metaV - saldo)} para su ${a?.meta_nombre || "meta"}.`}</p></>}
      </div>
      {canEdit && (
        <div className="flex items-end gap-2">
          <FormField label="¿En qué gastó?" className="flex-1"><Input className="h-11" value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Ej. Dulces" /></FormField>
          <div className="w-36"><MoneyInput value={valor} onChange={setValor} /></div>
          <Button variant="outline" className="h-11" onClick={() => mov(-1, desc, valor)}><Minus /> Anotar</Button>
        </div>
      )}
      {movs.length > 0 && <ul className="grid divide-y text-sm">{[...movs].reverse().slice(0, 6).map((x) => <li key={x.id} className="flex justify-between py-1.5"><span>{x.descripcion} <span className="text-muted-foreground">· {fmtDate(x.fecha)}</span></span><Money value={Number(x.valor)} sign className={Number(x.valor) >= 0 ? "text-success" : "text-danger"} /></li>)}</ul>}
    </Card>
  )
}

export function MesadasView() {
  const canEdit = useCanEdit()
  const { data: members = [], isPending } = useMembers()
  const { data: allowances = [] } = useList("allowances")
  const { data: movs = [] } = useList("allowance_movements", { order: { column: "created_at" } })
  const kids = useMemo(() => members.filter((m) => !NO_HIJO.test(m.rol)), [members])
  if (isPending) return <PageSkeleton kpis={0} />
  return (
    <div className="grid gap-6">
      <PageHeader id="mesadas" />
      {!kids.length ? (
        <Card className="shadow-card ring-0"><EmptyState iso="mesadas" title="Agrega a tus hijos en tu perfil" description="Con su mesada aprenden a manejar plata: ven cuánto tienen, en qué gastan y cuánto les falta para su meta." action={<Button asChild><Link href="/perfil">Ir a Perfil</Link></Button>} /></Card>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          {kids.map((m) => { const a = allowances.find((x) => x.member_id === m.id); return <KidCard key={m.id} m={m} a={a} movs={movs.filter((x) => x.allowance_id === a?.id)} canEdit={canEdit} /> })}
        </div>
      )}
    </div>
  )
}
