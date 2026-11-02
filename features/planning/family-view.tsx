"use client"

import Link from "next/link"
import { useMemo, useState } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { Users } from "lucide-react"
import { toast } from "sonner"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { PageHeader } from "@/components/mirai/page-header"
import { Money } from "@/components/mirai/money"
import { MoneyInput } from "@/components/mirai/money-input"
import { StatusPill } from "@/components/mirai/status-pill"
import { EmptyState } from "@/components/mirai/empty-state"
import { FormField } from "@/components/mirai/field"
import { PageSkeleton } from "@/components/skeletons/page-skeleton"
import { initials } from "@/components/app/app-sidebar"
import { useApp, useCanEdit } from "@/components/app/app-context"
import { createClient } from "@/utils/supabase/client"
import { pagosMes } from "@/lib/domain"
import { fmtMoney, fmtPct, todayISO } from "@/lib/format"
import { cn } from "@/lib/utils"
import { useBookData } from "@/features/book/use-book-data"
import { useMembers } from "@/features/catalogs/hooks"
import { avatarTone } from "@/features/contacts/contacts-view"

function CupoEditor({ id, value }: { id: string; value: number }) {
  const { household } = useApp()
  const qc = useQueryClient()
  const [v, setV] = useState(value)
  return (
    <FormField label="Presupuesto al mes" tip="Cuánto puede gastar esta persona al mes. Te avisamos cuando se acerque.">
      <MoneyInput value={v} onChange={setV} onBlur={async () => {
        if (v === value) return
        await createClient().from("family_members").update({ cupo: v }).eq("id", id)
        qc.invalidateQueries({ queryKey: ["h", household.id, "family_members"] })
        toast.success("Presupuesto actualizado")
      }} />
    </FormField>
  )
}

export function FamilyView() {
  const canEdit = useCanEdit()
  const mes = todayISO().slice(0, 7)
  const { data: book, isPending } = useBookData()
  const { data: members = [], isPending: mp } = useMembers()
  const d = useMemo(() => {
    if (!book) return null
    const gastos = book.expenses.filter((g) => g.fecha.startsWith(mes))
    const gastoDe = (id: string | null) => gastos.filter((g) => (g.member_id ?? null) === id).reduce((a, g) => a + Number(g.valor), 0)
    const ingDe = (id: string) => book.incomes.filter((i) => i.member_id === id).reduce((a, i) => a + Number(i.valor) * pagosMes(i), 0)
    const totIng = members.reduce((a, m) => a + ingDe(m.id), 0)
    return { gastoDe, ingDe, totIng, compartido: gastoDe(null) }
  }, [book, members, mes])
  if (isPending || mp || !d) return <PageSkeleton kpis={0} />

  return (
    <div className="grid gap-6">
      <PageHeader id="familia" description="El presupuesto de cada integrante de la familia, lo que lleva gastado y cuánto aporta cada uno."
        actions={<Button variant="outline" asChild><Link href="/perfil"><Users /> Editar integrantes</Link></Button>} />
      {members.length < 2 ? (
        <Card className="shadow-card ring-0"><EmptyState iso="familia" title="Agrega los integrantes de tu familia" description="En tu perfil puedes agregar a tu pareja, hijos u otras personas del hogar." action={<Button asChild><Link href="/perfil">Ir a Perfil</Link></Button>} /></Card>
      ) : (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {members.map((m) => {
              const g = d.gastoDe(m.id), cupo = Number(m.cupo), u = cupo ? (g / cupo) * 100 : 0
              return (
                <Card key={m.id} className="gap-4 p-5 shadow-card ring-0">
                  <div className="flex items-center gap-3">
                    <Avatar className="size-11"><AvatarFallback className={cn("bg-gradient-to-br text-sm text-white", avatarTone(m.nombre))}>{initials(m.nombre)}</AvatarFallback></Avatar>
                    <div className="grid flex-1"><b>{m.nombre}</b><span className="text-sm text-muted-foreground">{m.rol}</span></div>
                    {cupo > 0 && <StatusPill tone={u >= 100 ? "vencido" : u >= 80 ? "porVencer" : "pagado"}>{fmtPct(u, 0)}</StatusPill>}
                  </div>
                  <p className="text-sm"><Money value={g} className="font-semibold" /> {cupo ? <>de <Money value={cupo} /></> : "gastado este mes"}</p>
                  <Progress value={Math.min(100, u)} className={cn("h-2", u >= 100 ? "[&>div]:bg-danger" : u >= 80 ? "[&>div]:bg-[#E08A00]" : "[&>div]:bg-lime")} />
                  {canEdit && <CupoEditor id={m.id} value={cupo} />}
                </Card>
              )
            })}
          </div>
          <Card className="shadow-card ring-0">
            <CardHeader><CardTitle className="text-base">Lo que aporta cada uno</CardTitle><CardDescription>Según los ingresos asignados a cada integrante.</CardDescription></CardHeader>
            <CardContent className="grid gap-3">
              {members.map((m) => { const v = d.ingDe(m.id), p = d.totIng ? (v / d.totIng) * 100 : 0; return (
                <div key={m.id} className="grid gap-1.5">
                  <div className="flex justify-between text-sm"><span>{m.nombre}</span><span><Money value={v} /> · {fmtPct(p, 0)}</span></div>
                  <Progress value={p} className="h-2 [&>div]:bg-forest" />
                </div>) })}
              <div className="mt-2 rounded-lg bg-muted p-4 text-sm">
                <p className="font-semibold">Gastos compartidos: {fmtMoney(d.compartido)}</p>
                <p className="text-muted-foreground">Si los reparten según lo que gana cada uno, a cada quien le toca:</p>
                <ul className="mt-2 grid gap-1">{members.map((m) => <li key={m.id} className="flex justify-between"><span>{m.nombre}</span><Money value={d.totIng ? (d.compartido * d.ingDe(m.id)) / d.totIng : d.compartido / members.length} className="font-semibold" /></li>)}</ul>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
