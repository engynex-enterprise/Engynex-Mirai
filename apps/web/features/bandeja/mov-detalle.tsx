"use client"

// Detalle de un movimiento de la bandeja sin salir de la página: valor, estado, fecha, de dónde sale, a quién se le
// paga, con qué y quién, más las acciones (pagar, cambiar la fecha, avisarme, editar el gasto o abrir su sección).
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { ResponsiveDialog } from "@/components/mirai/responsive-dialog"
import { Money } from "@/components/mirai/money"
import { StatusPill } from "@/components/mirai/status-pill"
import { Icon } from "@/components/mirai/icon"
import { EstadoPill } from "@/features/balance/balance-parts"
import { MODULOS, type Mov } from "@/lib/domain/flujo-integral"
import { sePuedePagar } from "@/lib/domain/bandeja"
import { fmtDate } from "@/lib/format"

export type Nombres = { para: (m: Mov) => string | null; medio: (m: Mov) => string | null; cuenta: (m: Mov) => string | null; quien: (m: Mov) => string | null }

export function MovDetalle({ mov, onOpenChange, nombres, hormiga, canEdit, onPagar, onFecha, onAvisar, onEditar }: {
  mov: Mov | null; onOpenChange: (o: boolean) => void; nombres: Nombres; hormiga: boolean; canEdit: boolean
  onPagar: (m: Mov) => void; onFecha: (m: Mov) => void; onAvisar: (m: Mov) => void; onEditar: (m: Mov) => void
}) {
  const m = mov
  const filas: [string, React.ReactNode][] = m ? [
    ["Fecha", fmtDate(m.fecha, { long: true })],
    ["Tipo de gasto", <Link key="mod" href={m.href} className="text-link hover:underline">{MODULOS[m.modulo].label}</Link>],
    ["Categoría", m.cat],
    ["¿A quién le pagas?", nombres.para(m) ?? "Sin decir"],
    ["Medio de pago", [nombres.medio(m), nombres.cuenta(m) && `cuenta ${nombres.cuenta(m)}`].filter(Boolean).join(" · ") || "Sin decir"],
    ["¿Quién gastó?", nombres.quien(m) ?? "Toda la familia"],
    ...(m.interes ? [["Intereses", <Money key="int" value={m.interes} />] as [string, React.ReactNode]] : []),
  ] : []
  const esFecha = m?.ref?.tabla === "fixed_expenses" || m?.ref?.tabla === "subscriptions"
  return (
    <ResponsiveDialog open={!!m} onOpenChange={onOpenChange} title={m?.n ?? ""} description={m?.s}>
      {m && (
        <div className="grid gap-4 pb-2" data-testid="mov-detalle">
          <div className="flex flex-wrap items-center gap-3">
            <Money value={m.v} className="text-3xl font-bold" />
            <EstadoPill m={m} />
            {hormiga && <StatusPill tone="warn" hint="Un gasto pequeño que se repite. Sumados, pesan.">Hormiga</StatusPill>}
          </div>
          {m.supuesto && <p className="text-sm text-muted-foreground">Por confirmar: su fecha ya pasó y no tienes registrado el pago. Mirai lo cuenta como pagado; confírmalo para que las cifras queden exactas.</p>}
          <dl className="grid gap-x-4 gap-y-2.5 text-sm sm:grid-cols-[10rem_minmax(0,1fr)]">
            {filas.map(([k, v]) => (
              <div key={k} className="contents">
                <dt className="text-muted-foreground">{k}</dt>
                <dd className="min-w-0 font-medium break-words max-sm:-mt-2 max-sm:mb-1">{v}</dd>
              </div>
            ))}
          </dl>
          <div className="flex flex-wrap gap-2">
            {canEdit && sePuedePagar(m) && <Button onClick={() => onPagar(m)}><Icon name="circle-check" /> {m.supuesto ? "Confirmar el pago" : "Pagar"}</Button>}
            {canEdit && esFecha && m.estado !== "hecho" && <Button variant="outline" onClick={() => onFecha(m)}><Icon name="calendar-clock" /> Cambiar la fecha</Button>}
            {canEdit && m.estado !== "hecho" && (!!m.ref || m.modulo === "impuestos" || m.modulo === "calendario") && <Button variant="outline" onClick={() => onAvisar(m)}><Icon name="bell" /> Avisarme</Button>}
            {canEdit && m.ref?.tabla === "expenses" && <Button variant="outline" onClick={() => onEditar(m)}><Icon name="pencil" /> Editar el gasto</Button>}
            <Button variant="ghost" asChild><Link href={m.href}>Abrir en {MODULOS[m.modulo].label}</Link></Button>
          </div>
        </div>
      )}
    </ResponsiveDialog>
  )
}
