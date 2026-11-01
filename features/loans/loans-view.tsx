"use client"

import { useMemo, useState } from "react"
import { parseAsString, useQueryState } from "nuqs"
import { Gem, Plus } from "lucide-react"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { PageHeader } from "@/components/mirai/page-header"
import { Kpi, KpiGrid } from "@/components/mirai/kpi"
import { Money } from "@/components/mirai/money"
import { StatusPill } from "@/components/mirai/status-pill"
import { EmptyState } from "@/components/mirai/empty-state"
import { Icon } from "@/components/mirai/icon"
import { PageSkeleton } from "@/components/skeletons/page-skeleton"
import { initials } from "@/components/app/app-sidebar"
import { useCanEdit } from "@/components/app/app-context"
import { useIdParam, useNewParam } from "@/hooks/use-new-param"
import { cuotasMes, loanEngine, loanName, loanStatus } from "@/lib/domain"
import { todayISO } from "@/lib/format"
import { cn } from "@/lib/utils"
import type { Row } from "@/lib/supabase/tables"
import { useBookData } from "@/features/book/use-book-data"
import { avatarTone } from "@/features/contacts/contacts-view"
import { LoanDetail, type LoanRow } from "./loan-detail"
import { LoanForm, type LoanKind } from "./loan-form"

const PILL = { ok: "pagado", bad: "vencido", warn: "porVencer", info: "info" } as const

export function LoansView({ kind }: { kind: LoanKind }) {
  const isC = kind === "cobrar"
  const today = todayISO()
  const canEdit = useCanEdit()
  const [nuevo, setNuevo] = useNewParam()
  const [id, setId] = useIdParam()
  const [cid] = useQueryState("cid", parseAsString)
  const [empeno, setEmpeno] = useState(false)
  const { data: book, isPending } = useBookData()

  const list = useMemo(() => {
    if (!book) return []
    return (book.loans.filter((L) => L.kind === kind) as unknown as LoanRow[]).map((L) => ({ L, e: loanEngine(L, today) }))
      .sort((a, b) => Number(a.e.done) - Number(b.e.done) || b.e.mora - a.e.mora)
  }, [book, kind, today])
  if (isPending || !book) return <PageSkeleton kpis={3} />
  const contacts = book.contacts as unknown as Row<"contacts">[]
  const entities = book.entities as unknown as Row<"entities">[]
  const anticipo = book.settings.anticipo
  const sel = list.find((x) => x.L.id === id) ?? list[0]
  const total = list.reduce((a, x) => a + x.e.saldo, 0)
  const atrasados = list.filter((x) => x.e.mora > 0).length

  return (
    <div className="grid gap-6">
      <PageHeader id={kind === "cobrar" ? "me-deben" : "le-debo"}
        description={isC ? "Personas o clientes que te deben dinero. Registra cada pago, sea la cuota exacta o un abono." : "Créditos con bancos y deudas con personas. Registra cada pago y mira cuánto te falta."}
        actions={canEdit && <>
          {!isC && <Button variant="outline" onClick={() => { setEmpeno(true); setNuevo(true) }}><Gem /> Registrar empeño</Button>}
          <Button onClick={() => { setEmpeno(false); setNuevo(true) }}><Plus /> {isC ? "Nuevo préstamo" : "Nueva deuda"}</Button>
        </>} />
      <KpiGrid className="xl:grid-cols-3">
        <Kpi icon={isC ? "hand-coins" : "landmark"} tone={isC ? "income" : "expense"} label={isC ? "Total que te deben" : "Total que debes"} value={<Money value={total} />} sub={`${list.length} ${isC ? "préstamo" : "deuda"}${list.length === 1 ? "" : "s"}`} />
        <Kpi icon="calendar-clock" tone="amber" label="Cuotas al mes" value={<Money value={cuotasMes(book.loans, kind, today)} />} sub={isC ? "Lo que deberías recibir" : "Lo que debes pagar"} />
        <Kpi icon="circle-alert" tone={atrasados ? "red" : "green"} label="Atrasados" value={atrasados} valueClassName={atrasados ? "text-danger" : "text-success"} sub={atrasados ? (isC ? "Personas con pagos atrasados" : "Deudas en mora") : "Ninguno"} />
      </KpiGrid>
      {!list.length ? (
        <Card className="shadow-card ring-0"><EmptyState iso={isC ? "me-deben" : "le-debo"} title={isC ? "Aún no registras préstamos" : "Aún no registras deudas"}
          description={isC ? "Registra a quién le prestaste dinero y lleva el control de cada pago." : "Registra tus créditos y deudas para saber cuánto debes y cuándo pagar."}
          action={canEdit && <Button onClick={() => setNuevo(true)}><Plus /> {isC ? "Nuevo préstamo" : "Nueva deuda"}</Button>} /></Card>
      ) : (
        <div className="grid items-start gap-6 xl:grid-cols-[minmax(260px,0.75fr)_2fr]">
          <Card className="shadow-card ring-0">
            <CardHeader><CardTitle className="text-base">{isC ? "Quién me debe" : "A quién le debo"}</CardTitle></CardHeader>
            <CardContent className="grid gap-1 px-3">
              {list.map(({ L, e }) => {
                const nm = loanName(L, contacts, entities)
                const [st, txt] = loanStatus(e, today, anticipo)
                return (
                  <button key={L.id} type="button" onClick={() => setId(L.id)} className={cn("grid gap-2 rounded-lg p-3 text-left hover:bg-hover", sel?.L.id === L.id && "bg-brand-soft hover:bg-brand-soft")}>
                    <span className="flex items-center gap-3">
                      <Avatar className="size-9">{L.contact_id ? <AvatarFallback className={cn("bg-gradient-to-br text-xs text-white", avatarTone(nm))}>{initials(nm)}</AvatarFallback> : <AvatarFallback className="bg-muted"><Icon name="landmark" className="size-4" /></AvatarFallback>}</Avatar>
                      <span className="grid min-w-0 flex-1"><span className="truncate font-semibold">{nm}</span><span className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">{L.concepto && <span className="truncate">{L.concepto} ·</span>}<StatusPill tone={PILL[st]}>{txt}</StatusPill></span></span>
                      <Money value={e.saldo} className="font-bold" />
                    </span>
                    <Progress value={e.progreso * 100} className={cn("h-1.5", isC ? "[&>div]:bg-forest" : "[&>div]:bg-expense")} />
                  </button>
                )
              })}
            </CardContent>
          </Card>
          {sel && <LoanDetail key={sel.L.id} loan={sel.L} contacts={contacts} entities={entities} anticipo={anticipo} onDeleted={() => setId(null)} />}
        </div>
      )}
      <LoanForm kind={kind} open={nuevo} empeno={empeno} contactId={cid} onOpenChange={(o) => { if (!o) { setNuevo(false); setEmpeno(false) } }} onSaved={(x) => setId(x)} />
    </div>
  )
}
