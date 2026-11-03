"use client"

import Link from "next/link"
import { useMemo, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { Minus, Plus } from "lucide-react"
import { toast } from "@/components/mirai/toast"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Progress } from "@/components/ui/progress"
import { Spinner } from "@/components/ui/spinner"
import { PageHeader } from "@/components/mirai/page-header"
import { Money } from "@/components/mirai/money"
import { MoneyInput } from "@/components/mirai/money-input"
import { MoneyAutosave } from "@/components/mirai/money-autosave"
import { Segmented } from "@/components/mirai/choice-cards"
import { FormField } from "@/components/mirai/field"
import { EmptyState } from "@/components/mirai/empty-state"
import { Kpi, KpiGrid } from "@/components/mirai/kpi"
import { SectionTitle } from "@/components/mirai/panel"
import { SubmitButton } from "@/components/mirai/submit-button"
import { ToneIcon } from "@/components/mirai/tone-icon"
import { UserAvatar } from "@/components/mirai/user-avatar"
import { PageSkeleton } from "@/components/skeletons/page-skeleton"
import { useBookId, useCanEdit } from "@/components/app/app-context"
import { invalidateBook, useList } from "@/hooks/use-book-data"
import { createClient } from "@/utils/supabase/client"
import { fmtDate, fmtMoney, todayISO } from "@/lib/format"
import type { Row } from "@/lib/supabase/tables"
import { useMembers } from "@/features/catalogs/hooks"

const NO_HIJO = /titular|c[oó]nyuge|esposa|esposo|pareja/i
const FRECS = [{ value: "semanal", label: "Semanal" }, { value: "quincenal", label: "Quincenal" }, { value: "mensual", label: "Mensual" }]

function KidCard({ m, a, movs, canEdit }: { m: Row<"family_members">; a: Row<"allowances"> | undefined; movs: Row<"allowance_movements">[]; canEdit: boolean }) {
  const bookId = useBookId()
  const qc = useQueryClient()
  const sb = createClient()
  const [desc, setDesc] = useState("")
  const [valor, setValor] = useState(0)
  const [busy, setBusy] = useState<"dar" | "gasto" | null>(null)
  const saldo = movs.reduce((s, x) => s + Number(x.valor), 0)
  const mesada = Number(a?.mesada ?? 20000)
  const refresh = () => { invalidateBook(qc, bookId, "allowances"); invalidateBook(qc, bookId, "allowance_movements") }
  const ensure = async () => {
    if (a) return a.id
    const { data, error } = await sb.from("allowances").insert({ book_id: bookId, member_id: m.id }).select("id").single()
    if (error) throw new Error(error.message)
    return data.id
  }
  const upd = async (p: Partial<Row<"allowances">>) => {
    try {
      const id = await ensure()
      const { error } = await sb.from("allowances").update(p).eq("id", id)
      if (error) throw new Error(error.message)
      refresh()
    } catch (e) { toast.error("No se pudo guardar", { description: (e as Error).message }) }
  }
  const mov = async (signo: 1 | -1, d: string, v: number) => {
    if (!v) return toast.error("Escribe el valor")
    setBusy(signo > 0 ? "dar" : "gasto")
    try {
      const id = await ensure()
      const { error } = await sb.from("allowance_movements").insert({ book_id: bookId, allowance_id: id, fecha: todayISO(), descripcion: d || (signo > 0 ? "Mesada" : "Gasto"), valor: signo * Math.abs(v) })
      if (error) throw new Error(error.message)
      toast.success(signo > 0 ? "Mesada entregada" : "Gasto anotado")
      if (signo < 0) { setDesc(""); setValor(0) }
      refresh()
    } catch (e) { toast.error("No se pudo guardar", { description: (e as Error).message }) } finally { setBusy(null) }
  }
  const metaV = Number(a?.meta_valor ?? 0)
  const metaP = metaV > 0 ? Math.min(100, (saldo / metaV) * 100) : 0
  return (
    <Card className="h-full gap-4 p-5 shadow-card ring-0">
      <div className="flex items-center gap-3">
        <UserAvatar src={m.avatar} name={m.nombre} className="size-11" fallbackClassName="text-sm" />
        <div className="grid min-w-0 flex-1"><h2 className="truncate font-semibold">{m.nombre}</h2><span className="text-sm text-muted-foreground">{m.rol}</span></div>
        <div className="text-right"><p className="text-xs text-muted-foreground">Tiene</p><Money value={saldo} className={saldo >= 0 ? "text-lg font-bold text-success" : "text-lg font-bold text-danger"} /></div>
      </div>
      {canEdit && (
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField label="Mesada" tip="Lo que le das cada vez. Se guarda al salir del campo."><MoneyAutosave value={mesada} onSave={(v) => upd({ mesada: v })} /></FormField>
          <FormField label="¿Cada cuánto?" tip={false}><Segmented value={a?.frec ?? "semanal"} onChange={(v) => upd({ frec: v })} items={FRECS} /></FormField>
        </div>
      )}
      {canEdit && (
        <Button variant="soft" className="w-fit max-sm:w-full" disabled={!!busy} onClick={() => mov(1, "Mesada", mesada)}>
          {busy === "dar" ? <Spinner /> : <Plus />} Entregar mesada de {fmtMoney(mesada)}
        </Button>
      )}
      <div className="grid gap-2 rounded-lg bg-muted p-3">
        <p className="flex items-center gap-2 text-sm font-semibold"><ToneIcon icon="target" tone="green" size="sm" /> Su meta de ahorro</p>
        {canEdit && (
          <div className="grid gap-2 sm:grid-cols-2">
            <Input className="h-10" aria-label={`Meta de ahorro de ${m.nombre}`} placeholder="Ej. Una bicicleta" defaultValue={a?.meta_nombre ?? ""} onBlur={(e) => e.target.value !== (a?.meta_nombre ?? "") && upd({ meta_nombre: e.target.value })} />
            <MoneyAutosave value={metaV} onSave={(v) => upd({ meta_valor: v })} placeholder="Valor de la meta" />
          </div>
        )}
        {metaV > 0 ? (
          <>
            <Progress value={metaP} aria-label={`Avance de la meta: ${Math.round(metaP)} %`} className="h-2 [&>div]:bg-lime" />
            <p className="text-sm">{saldo >= metaV ? "¡Meta cumplida! 🎉" : `Le faltan ${fmtMoney(metaV - saldo)} para su ${a?.meta_nombre || "meta"}.`}</p>
          </>
        ) : <p className="text-sm text-muted-foreground">Ponle una meta: ver cuánto le falta lo motiva a ahorrar.</p>}
      </div>
      {canEdit && (
        <form className="grid gap-2 sm:flex sm:items-end" onSubmit={(e) => { e.preventDefault(); if (valor > 0) void mov(-1, desc, valor) }}>
          <FormField label="¿En qué gastó?" htmlFor={`ms-d-${m.id}`} tip={false} className="flex-1"><Input id={`ms-d-${m.id}`} className="h-11" value={desc} onChange={(e) => setDesc(e.target.value)} placeholder="Ej. Dulces" /></FormField>
          <FormField label="Cuánto" htmlFor={`ms-v-${m.id}`} tip={false} className="sm:w-36"><MoneyInput id={`ms-v-${m.id}`} value={valor} onChange={setValor} /></FormField>
          <SubmitButton className="h-11" disabled={valor <= 0} loading={busy === "gasto"} loadingText="Anotando…" onClick={() => mov(-1, desc, valor)} hint="Escribe cuánto gastó">
            <Minus /> Anotar
          </SubmitButton>
        </form>
      )}
      {movs.length > 0 && (
        <div className="mt-auto grid gap-1">
          <p className="text-xs font-semibold text-muted-foreground uppercase">Últimos movimientos</p>
          <ul className="grid divide-y text-sm">
            {[...movs].reverse().slice(0, 6).map((x) => {
              const v = Number(x.valor)
              return (
                <li key={x.id} className="flex items-center gap-2 py-1.5">
                  <ToneIcon icon={v >= 0 ? "arrow-down-to-line" : "shopping-bag"} tone={v >= 0 ? "green" : "red"} size="sm" />
                  <span className="min-w-0 flex-1 truncate">{x.descripcion} <span className="text-muted-foreground">· {fmtDate(x.fecha)}</span></span>
                  <Money value={v} sign className={v >= 0 ? "text-success" : "text-danger"} />
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </Card>
  )
}

export function MesadasView() {
  const canEdit = useCanEdit()
  const { data: members = [], isPending } = useMembers()
  const { data: allowances = [] } = useList("allowances")
  const { data: movs = [] } = useList("allowance_movements", { order: { column: "created_at" } })
  const kids = useMemo(() => members.filter((m) => !NO_HIJO.test(m.rol)), [members])
  if (isPending) return <PageSkeleton kpis={3} />
  const mes = todayISO().slice(0, 7)
  const ids = new Set(allowances.filter((a) => kids.some((k) => k.id === a.member_id)).map((a) => a.id))
  const mine = movs.filter((x) => ids.has(x.allowance_id))
  const tienen = mine.reduce((s, x) => s + Number(x.valor), 0)
  const dado = mine.filter((x) => x.fecha.startsWith(mes) && Number(x.valor) > 0).reduce((s, x) => s + Number(x.valor), 0)
  const gastado = mine.filter((x) => x.fecha.startsWith(mes) && Number(x.valor) < 0).reduce((s, x) => s - Number(x.valor), 0)
  return (
    <div className="grid gap-6">
      <PageHeader id="mesadas" />
      {!kids.length ? (
        <Card className="shadow-card ring-0"><EmptyState iso="mesadas" title="Agrega a tus hijos en tu perfil" description="Con su mesada aprenden a manejar plata: ven cuánto tienen, en qué gastan y cuánto les falta para su meta." action={<Button asChild><Link href="/perfil">Ir a Perfil</Link></Button>} /></Card>
      ) : (
        <>
          <KpiGrid className="xl:grid-cols-3">
            <Kpi icon="piggy-bank" tone="green" label="Tienen entre todos" value={<Money value={tienen} />} sub={`${kids.length} ${kids.length === 1 ? "hijo" : "hijos"}`} />
            <Kpi icon="hand-coins" tone="blue" label="Mesadas este mes" value={<Money value={dado} />} sub="Lo que les entregaste" />
            <Kpi icon="shopping-bag" tone="amber" label="Gastaron este mes" value={<Money value={gastado} />} sub="Lo que anotaron" />
          </KpiGrid>
          <SectionTitle icon="users" description="Entrega la mesada, anota en qué gastan y sigue su meta de ahorro.">Cada hijo</SectionTitle>
          <div className="grid gap-6 lg:grid-cols-2">
            {kids.map((m) => { const a = allowances.find((x) => x.member_id === m.id); return <KidCard key={m.id} m={m} a={a} movs={movs.filter((x) => x.allowance_id === a?.id)} canEdit={canEdit} /> })}
          </div>
        </>
      )}
    </div>
  )
}
