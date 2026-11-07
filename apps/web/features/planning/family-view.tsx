"use client"

import Link from "next/link"
import { useMemo, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { Users } from "lucide-react"
import { toast } from "@/components/mirai/toast"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { PageHeader } from "@/components/mirai/page-header"
import { Money } from "@/components/mirai/money"
import { MoneyInput } from "@/components/mirai/money-input"
import { StatusPill } from "@/components/mirai/status-pill"
import { EmptyState } from "@/components/mirai/empty-state"
import { FormField } from "@/components/mirai/field"
import { Kpi, KpiGrid } from "@/components/mirai/kpi"
import { Panel, SectionTitle } from "@/components/mirai/panel"
import { Tip } from "@/components/mirai/tip"
import { UserAvatar } from "@/components/mirai/user-avatar"
import { PageSkeleton } from "@/components/skeletons/page-skeleton"
import { useApp, useCanEdit } from "@/components/app/app-context"
import { pagosMes } from "@/lib/domain"
import { fmtPct, todayISO } from "@/lib/format"
import { cn } from "@/lib/utils"
import { useBookData } from "@/features/book/use-book-data"
import { patchMember, useMembers } from "@/features/catalogs/hooks"

function CupoEditor({ id, value }: { id: string; value: number }) {
  const { household } = useApp()
  const qc = useQueryClient()
  const [v, setV] = useState(value)
  return (
    <FormField label="Presupuesto al mes" tip="Cuánto puede gastar esta persona al mes. Te avisamos cuando se acerque.">
      <MoneyInput value={v} onChange={setV} onBlur={async () => {
        if (v === value) return
        try { await patchMember(household.id, id, { cupo: v }) } catch (e) { return toast.error("No se pudo guardar el presupuesto", { description: (e as Error).message }) }
        qc.invalidateQueries({ queryKey: ["h", household.id, "family_members"] })
        toast.success("Presupuesto actualizado")
      }} />
    </FormField>
  )
}

export function FamilyView() {
  const canEdit = useCanEdit()
  const { user } = useApp()
  const mes = todayISO().slice(0, 7)
  const { data: book, isPending } = useBookData()
  const { data: members = [], isPending: mp } = useMembers()
  const d = useMemo(() => {
    if (!book) return null
    const gastos = book.expenses.filter((g) => g.fecha.startsWith(mes))
    // Un gasto de varias personas (gasto fijo compartido) se reparte en partes iguales entre ellas.
    const varios = (g: (typeof gastos)[number]) => ((g as { member_ids?: string[] | null }).member_ids ?? []).length > 1
    const gastoDe = (id: string | null) =>
      gastos.filter((g) => !varios(g) && (g.member_id ?? null) === id).reduce((a, g) => a + Number(g.valor), 0) +
      (id ? gastos.filter((g) => varios(g) && (g as { member_ids?: string[] | null }).member_ids!.includes(id)).reduce((a, g) => a + Number(g.valor) / (g as { member_ids?: string[] | null }).member_ids!.length, 0) : 0)
    const ingDe = (id: string) => book.incomes.filter((i) => i.member_id === id).reduce((a, i) => a + Number(i.valor) * pagosMes(i), 0)
    const totIng = members.reduce((a, m) => a + ingDe(m.id), 0)
    return { gastoDe, ingDe, totIng, compartido: gastoDe(null) }
  }, [book, members, mes])
  if (isPending || mp || !d) return <PageSkeleton kpis={3} />
  const gastadoTotal = book ? book.expenses.filter((g) => g.fecha.startsWith(mes)).reduce((a, g) => a + Number(g.valor), 0) : 0

  return (
    <div className="grid gap-6">
      <PageHeader id="familia" description="El presupuesto de cada integrante de la familia, lo que lleva gastado y cuánto aporta cada uno."
        actions={<Button variant="outline" asChild><Link href="/perfil"><Users /> Editar integrantes</Link></Button>} />
      {members.length < 2 ? (
        <Card className="shadow-card ring-0"><EmptyState iso="familia" title="Agrega los integrantes de tu familia" description="En tu perfil puedes agregar a tu pareja, hijos u otras personas del hogar." action={<Button asChild><Link href="/perfil">Ir a Perfil</Link></Button>} /></Card>
      ) : (
        <>
          <KpiGrid className="xl:grid-cols-3">
            <Kpi icon="wallet" tone="green" label="Ingresos del hogar" value={<Money value={d.totIng} />} sub="Al mes, de todos" />
            <Kpi icon="receipt" tone="red" label="Gastado este mes" value={<Money value={gastadoTotal} />} sub={`${members.length} integrantes`} />
            <Kpi icon="users" tone="blue" label="Gastos compartidos" value={<Money value={d.compartido} />} sub="Sin persona asignada" />
          </KpiGrid>
          <SectionTitle icon="users" description="Cuánto lleva gastado cada uno este mes frente a su presupuesto.">Cada integrante</SectionTitle>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {members.map((m) => {
              const g = d.gastoDe(m.id), cupo = Number(m.cupo), u = cupo ? (g / cupo) * 100 : 0
              return (
                <Card key={m.id} className="h-full gap-4 p-5 shadow-card ring-0">
                  <div className="flex items-center gap-3">
                    <UserAvatar src={m.avatar || (m.es_titular ? user.avatar : null)} name={m.nombre} className="size-11" fallbackClassName="text-sm" />
                    <div className="grid min-w-0 flex-1"><h2 className="truncate font-semibold">{m.nombre}</h2><span className="text-sm text-muted-foreground">{m.rol}</span></div>
                    {cupo > 0 && (
                      <Tip label={u >= 100 ? "Se pasó de su presupuesto del mes" : u >= 80 ? "Va cerca de su presupuesto" : "Va dentro de su presupuesto"}>
                        <span tabIndex={0} className="rounded-full focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"><StatusPill tone={u >= 100 ? "vencido" : u >= 80 ? "porVencer" : "pagado"}>{fmtPct(u, 0)}</StatusPill></span>
                      </Tip>
                    )}
                  </div>
                  <p className="text-sm"><Money value={g} className="font-semibold" /> {cupo ? <>de <Money value={cupo} /></> : "gastado este mes"}</p>
                  <Progress value={Math.min(100, u)} aria-label={`Uso del presupuesto de ${m.nombre}`} className={cn("h-2", u >= 100 ? "[&>div]:bg-danger" : u >= 80 ? "[&>div]:bg-[#E08A00]" : "[&>div]:bg-lime")} />
                  {canEdit && <div className="mt-auto"><CupoEditor id={m.id} value={cupo} /></div>}
                </Card>
              )
            })}
          </div>
          <Panel title="Lo que aporta cada uno" icon="hand-coins" description="Según los ingresos asignados a cada integrante.">
            <div className="grid gap-6 lg:grid-cols-2">
              <ul className="grid content-start gap-3">
                {members.map((m) => { const v = d.ingDe(m.id), p = d.totIng ? (v / d.totIng) * 100 : 0; return (
                  <li key={m.id} className="grid gap-1.5">
                    <div className="flex justify-between gap-2 text-sm"><span className="truncate">{m.nombre}</span><span className="shrink-0"><Money value={v} /> · {fmtPct(p, 0)}</span></div>
                    <Progress value={p} aria-label={`Aporte de ${m.nombre}: ${fmtPct(p, 0)}`} className="h-2 [&>div]:bg-forest" />
                  </li>) })}
              </ul>
              <div className="rounded-lg bg-muted p-4 text-sm">
                <p className="font-semibold">Gastos compartidos: <Money value={d.compartido} /></p>
                <p className="text-muted-foreground">Si los reparten según lo que gana cada uno, a cada quien le toca:</p>
                <ul className="mt-2 grid gap-1">{members.map((m) => <li key={m.id} className="flex justify-between gap-2"><span className="truncate">{m.nombre}</span><Money value={d.totIng ? (d.compartido * d.ingDe(m.id)) / d.totIng : d.compartido / members.length} className="font-semibold" /></li>)}</ul>
              </div>
            </div>
          </Panel>
        </>
      )}
    </div>
  )
}
