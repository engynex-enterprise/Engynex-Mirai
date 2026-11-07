"use client"

import { useEffect } from "react"
import { useQueryClient } from "@tanstack/react-query"
import { TrendingDown, TrendingUp } from "lucide-react"
import { Card } from "@/components/ui/card"
import { Money } from "@/components/mirai/money"
import { useBookId, useCanEdit } from "@/components/app/app-context"
import { guardarPatrimonio } from "@/features/balance/commands"
import { invalidateBook, useList } from "@/hooks/use-book-data"
import { monthName } from "@/lib/format"
import { cn } from "@/lib/utils"

const mesActual = () => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Bogota", year: "numeric", month: "2-digit" }).format(new Date())

/**
 * Patrimonio mes a mes (lo que tienes menos lo que debes). Cada vez que abres el Balance se guarda la foto del mes
 * actual; así ves en el tiempo si tu patrimonio crece. Los meses pasados quedan como estaban al final de ese mes.
 */
export function PatrimonioCard({ activos, deudas }: { activos: number; deudas: number }) {
  const bookId = useBookId()
  const can = useCanEdit()
  const qc = useQueryClient()
  const { data } = useList("net_worth_snapshots")
  const mes = mesActual()
  const pat = activos - deudas
  const actual = data?.find((s) => s.mes === mes)
  useEffect(() => {
    if (!can || !data) return
    if (actual && Math.abs(+actual.patrimonio - pat) < 1 && Math.abs(+actual.activos - activos) < 1) return
    // Si no se pudo guardar (p. ej. la API rechaza el valor) no se recarga: recargar volvería a intentarlo sin parar.
    void guardarPatrimonio(bookId, mes, activos, deudas).then((r) => { if (!r.error) invalidateBook(qc, bookId, "net_worth_snapshots") })
  }, [can, data, actual, pat, activos, deudas, bookId, mes, qc])
  const serie = [...(data ?? []).filter((s) => s.mes !== mes), { mes, patrimonio: pat }].sort((a, b) => a.mes.localeCompare(b.mes)).slice(-12).map((s) => ({ mes: s.mes, v: +s.patrimonio }))
  if (serie.length < 1) return null
  const prev = serie.at(-2)
  const delta = prev ? pat - prev.v : 0
  const max = Math.max(1, ...serie.map((s) => Math.abs(s.v)))
  return (
    <Card className="gap-4 p-5 shadow-card ring-0" aria-label="Patrimonio mes a mes">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div><h2 className="font-semibold">Tu patrimonio mes a mes</h2><p className="text-sm text-muted-foreground">Lo que tienes menos lo que debes, al cierre de cada mes.</p></div>
        {prev && <p className={cn("flex items-center gap-1 text-sm font-semibold", delta >= 0 ? "text-success" : "text-danger")}>{delta >= 0 ? <TrendingUp className="size-4" /> : <TrendingDown className="size-4" />}<Money value={delta} sign /> frente a {monthName(+prev.mes.slice(5, 7), false)}</p>}
      </div>
      <div className="flex h-36 items-end gap-2" role="img" aria-label={`Patrimonio de los últimos ${serie.length} meses`}>
        {serie.map((s) => (
          <div key={s.mes} className="grid h-full flex-1 grid-rows-[1fr_auto] items-end gap-1 text-center">
            <div className="flex h-full items-end justify-center"><span title={`${s.mes}: $${Math.round(s.v).toLocaleString("es-CO")}`} className={cn("w-full max-w-10 rounded-t-md", s.v >= 0 ? "bg-brand" : "bg-danger", s.mes === mes && "ring-2 ring-brand/40")} style={{ height: `${Math.max(4, (Math.abs(s.v) / max) * 100)}%` }} /></div>
            <span className="text-[11px] text-muted-foreground capitalize">{monthName(+s.mes.slice(5, 7), false)}</span>
          </div>
        ))}
      </div>
      {serie.length === 1 && <p className="text-xs text-muted-foreground">Desde hoy guardamos tu patrimonio cada mes. En unos meses verás aquí cómo crece.</p>}
    </Card>
  )
}
