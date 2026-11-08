"use client"

import Link from "next/link"
import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { Money } from "@/components/mirai/money"
import { StatusPill, type PillTone } from "@/components/mirai/status-pill"
import { EntityLogo } from "@/components/mirai/entity-logo"
import { IconAction } from "@/components/mirai/list-row"
import { Icon } from "@/components/mirai/icon"
import { IconButton } from "@/components/mirai/tip"
import { Panel } from "@/components/mirai/panel"
import type { HallazgoBalance } from "@/lib/domain/balance"
import { ESTADOS, MODULOS, MODULO_ORDEN, type Estado, type FlujoIntegral, type Modulo, type Mov, type ParteEstado } from "@/lib/domain/flujo-integral"
import { fmtDate, fmtMonth, fmtPct } from "@/lib/format"
import { cn } from "@/lib/utils"
import type { Row } from "@/lib/supabase/tables"

export type Line = {
  id?: string; table?: "assets" | "liabilities"; icon: string; n: string; s: string; v: number; href?: string
  row?: Row<"assets"> | Row<"liabilities">
  /** Grupo de la cuenta T ("Dinero en cuentas", "Créditos y préstamos"…): las líneas van ordenadas por grupo. */
  grupo?: string
  estimado?: boolean
  /** Cuenta que lleva el saldo con los movimientos (se cuadra con el banco). */
  vivo?: boolean
}

/** Navegación entre periodos (‹ noviembre 2026 ›). `label` por defecto: el mes de `ym`. */
export function MonthNav({ ym, label, onMove, children }: { ym: string; label?: string; onMove: (d: number) => void; children?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button variant="outline" size="icon" aria-label="Periodo anterior" onClick={() => onMove(-1)}><ChevronLeft /></Button>
      <p className="min-w-36 text-center font-semibold capitalize sm:min-w-44">{label ?? fmtMonth(ym)}</p>
      <Button variant="outline" size="icon" aria-label="Periodo siguiente" onClick={() => onMove(1)}><ChevronRight /></Button>
      {children}
    </div>
  )
}

/** Una columna de la cuenta T (DEBE / HABER), con subtotales por grupo. Tocar el nombre de una cuenta propia abre su edición. */
export function TColumn({ title, sub, lines, total, empty, onDelete, onEdit, canEdit }: {
  title: string; sub: string; lines: Line[]; total: number; empty: string; onDelete: (l: Line) => void; onEdit: (l: Line) => void; canEdit: boolean
}) {
  const grupos = [...new Set(lines.map((l) => l.grupo ?? ""))]
  return (
    <div className="grid content-start gap-1">
      <div className="border-b-[3px] border-foreground pb-2">
        <p className="font-semibold">{title}</p>
        <p className="text-xs tracking-wide text-muted-foreground uppercase">{sub}</p>
      </div>
      {!lines.length ? <p className="py-4 text-sm text-muted-foreground">{empty}</p> : grupos.map((g) => {
        const ls = lines.filter((l) => (l.grupo ?? "") === g)
        return (
          <div key={g} className="grid gap-0">
            {g && (
              <div className="mt-2 flex items-baseline justify-between gap-2 text-xs font-semibold tracking-wide text-muted-foreground uppercase">
                <span>{g}</span><Money value={ls.reduce((a, l) => a + l.v, 0)} />
              </div>
            )}
            {ls.map((l, i) => (
              <div key={l.id ?? `${g}-${i}`} data-nombre={l.n} className="grid grid-cols-[2rem_minmax(0,1fr)_auto_auto] items-center gap-2 border-b border-dotted py-2">
                <EntityLogo name={l.row ? l.n : null} icon={l.icon} seed={l.n} size={32} />
                <span className="grid min-w-0">
                  <span className="flex min-w-0 items-center gap-1.5 font-medium">
                    <span className="truncate">
                      {l.href ? <Link href={l.href} className="hover:text-link">{l.n}</Link>
                        : l.row && canEdit ? <button type="button" className="max-w-full truncate text-left hover:text-link" onClick={() => onEdit(l)}>{l.n}</button>
                        : l.n}
                    </span>
                    {l.estimado && <StatusPill tone="estimado" hint="Calculado con tus datos: aún no tiene un valor exacto.">Estimado</StatusPill>}
                  </span>
                  {l.s && <span className="truncate text-xs text-muted-foreground">{l.s}</span>}
                </span>
                <Money value={l.v} className="text-right font-semibold" />
                {l.row && canEdit ? (
                  <span className="flex">
                    <IconAction a={{ label: `Actualizar ${l.n}`, tip: l.vivo ? "Ver movimientos o cuadrar con tu banco" : "Actualizar el valor", icon: l.vivo ? "scale" : "pencil", onClick: () => onEdit(l) }} className="max-sm:hidden" />
                    <IconAction a={{ label: `Eliminar ${l.n}`, tip: "Eliminar", icon: "trash-2", destructive: true, onClick: () => onDelete(l) }} />
                  </span>
                ) : l.href ? <IconButton label={`Ver ${l.n}`} icon="chevron-right" href={l.href} className="text-muted-foreground" /> : <span className="w-9" />}
              </div>
            ))}
          </div>
        )
      })}
      <div className="mt-1 flex justify-between border-t-2 border-foreground pt-2 font-bold"><span>Total</span><Money value={total} /></div>
    </div>
  )
}

const PILL: Record<Estado, PillTone> = { hecho: "pagado", programado: "gray", vencido: "vencido", estimado: "estimado" }

/** Etiqueta del estado de un movimiento (lo que ya pasó sin registro dice "Ya pasó"). */
export function EstadoPill({ m }: { m: Pick<Mov, "estado" | "supuesto" | "dir"> }) {
  if (m.estado === "hecho" && m.supuesto) return <StatusPill tone="info" hint="Su fecha ya pasó. Mirai no tiene cómo saber si se pagó o se recibió, así que lo cuenta como hecho.">Ya pasó</StatusPill>
  const hint = m.estado === "vencido" && m.dir === "entra" ? "Su fecha ya pasó y no está registrado que te pagaron." : ESTADOS[m.estado].hint
  return <StatusPill tone={PILL[m.estado]} check={m.estado === "hecho"} hint={hint}>{ESTADOS[m.estado].label}</StatusPill>
}

/** Qué quiere decir cada etiqueta. */
export function EstadosLeyenda() {
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-muted-foreground">
      <span className="font-semibold">Qué significa:</span>
      {(Object.keys(ESTADOS) as Estado[]).map((e) => <span key={e} className="flex items-center gap-1"><StatusPill tone={PILL[e]} check={e === "hecho"}>{ESTADOS[e].label}</StatusPill> {ESTADOS[e].hint}</span>)}
      <span className="flex items-center gap-1"><StatusPill tone="info">Ya pasó</StatusPill> Su fecha pasó y Mirai no tiene el registro: lo cuenta como hecho.</span>
    </div>
  )
}

function MovRow({ x }: { x: Mov }) {
  return (
    <li className="grid grid-cols-[2rem_minmax(0,1fr)_auto] items-center gap-2 border-b border-dotted py-2 last:border-0">
      <EntityLogo name={x.modulo === "gastos" || x.modulo === "suscripciones" ? x.n : null} icon={x.icon} seed={x.n} size={32} />
      <span className="grid min-w-0">
        <span className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5 font-medium">
          <span className="min-w-0 truncate"><Link href={x.href} className="hover:text-link">{x.n}</Link></span>
          <EstadoPill m={x} />
        </span>
        <span className="truncate text-xs text-muted-foreground" data-money>{fmtDate(x.fecha, { year: false })} · {x.s}{x.interes ? ` · intereses ${Math.round(x.interes).toLocaleString("es-CO")}` : ""}</span>
      </span>
      <Money value={x.v} className={cn("text-right font-semibold", x.dir === "entra" && "text-success")} sign={x.dir === "entra"} />
    </li>
  )
}

/**
 * Entradas o salidas de un periodo agrupadas por módulo (Ingresos, Gastos fijos, Tarjetas, Deudas…), cada grupo con
 * su total, el reparto por categoría y un enlace a su sección. `abiertos`: si los grupos empiezan desplegados.
 */
export function FlujoColumna({ title, sub, movs, empty, abiertos = true }: { title: string; sub: string; movs: Mov[]; empty: React.ReactNode; abiertos?: boolean }) {
  const grupos = MODULO_ORDEN.map((k) => ({ k, l: movs.filter((x) => x.modulo === k) })).filter((g) => g.l.length)
  const total = movs.reduce((a, x) => a + x.v, 0)
  return (
    <div className="grid content-start gap-2">
      <div className="flex items-end justify-between gap-2 border-b-[3px] border-foreground pb-2">
        <div><p className="font-semibold">{title}</p><p className="text-xs tracking-wide text-muted-foreground uppercase">{sub}</p></div>
        <Money value={total} className="font-bold" />
      </div>
      {!grupos.length ? <p className="py-4 text-sm text-muted-foreground">{empty}</p> : grupos.map(({ k, l }) => <ModuloGrupo key={k} k={k} l={l} abierto={abiertos} />)}
    </div>
  )
}

function ModuloGrupo({ k, l, abierto }: { k: Modulo; l: Mov[]; abierto: boolean }) {
  const M = MODULOS[k]
  const tot = l.reduce((a, x) => a + x.v, 0)
  const cats = [...l.reduce((m, x) => m.set(x.cat, (m.get(x.cat) ?? 0) + x.v), new Map<string, number>())].sort((a, b) => b[1] - a[1])
  return (
    <details open={abierto} className="group rounded-lg bg-secondary/40 px-3 py-1" data-modulo={k}>
      <summary className="flex cursor-pointer list-none items-center gap-2 py-2 [&::-webkit-details-marker]:hidden">
        <span className="grid size-8 shrink-0 place-items-center rounded-full bg-card text-brand shadow-card"><Icon name={M.icon} className="size-4" /></span>
        <span className="grid min-w-0 flex-1">
          <span className="truncate font-semibold">{M.label}</span>
          <span className="truncate text-xs text-muted-foreground" data-money>{l.length} movimiento{l.length === 1 ? "" : "s"}{cats.length > 1 ? ` · ${cats.slice(0, 3).map(([c, v]) => `${c} ${Math.round((v / (tot || 1)) * 100)} %`).join(" · ")}` : ""}</span>
        </span>
        <Money value={tot} className="font-bold" />
        <ChevronDown className="size-4 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" aria-hidden />
      </summary>
      <ul className="grid">{l.map((x) => <MovRow key={x.id} x={x} />)}</ul>
      <Link href={M.href} className="mb-2 inline-block text-sm font-semibold text-link hover:underline">Ir a {M.label} ›</Link>
    </details>
  )
}

/** Tu mes: lo que entra, lo que sale, lo que ahorras y lo que queda, con el avance del presupuesto. */
export function MesCard({ q, ym, onMove, onDetalle, canEdit }: { q: FlujoIntegral; ym: string; onMove: (d: number) => void; onDetalle: () => void; canEdit: boolean }) {
  const usado = q.presupuesto ? Math.min(1, (q.presupuesto - q.porGastar) / q.presupuesto) : 0
  const t = q.tot
  return (
    <Panel title="Tu mes" icon="calendar-days" info="Todo lo que entra (ingresos, cobros, préstamos que te dieron) y todo lo que sale (gastos, fijos, suscripciones, cuotas, tarjetas, impuestos y mesadas). El ahorro va aparte porque no es gasto: sigue siendo tu plata."
      action={canEdit && <Button asChild size="sm" variant="soft"><Link href="/gastos?nuevo=1"><Icon name="plus" /> Registrar gasto</Link></Button>}>
      <MonthNav ym={ym} onMove={onMove} />
      <div className="grid grid-cols-2 gap-2 text-center sm:grid-cols-4">
        <div className="grid gap-0.5 rounded-lg bg-success-soft p-3"><span className="text-xs font-medium text-muted-foreground">Entra</span><Money value={t.entra} short className="font-bold text-success" /></div>
        <div className="grid gap-0.5 rounded-lg bg-danger-soft p-3"><span className="text-xs font-medium text-muted-foreground">Sale</span><Money value={t.sale} short className="font-bold text-danger" /></div>
        <div className="grid gap-0.5 rounded-lg bg-info-soft p-3"><span className="text-xs font-medium text-muted-foreground">Ahorras</span><Money value={t.ahorro} short className="font-bold text-info" /></div>
        <div className={cn("grid gap-0.5 rounded-lg p-3", t.queda >= 0 ? "bg-brand-soft" : "bg-danger-soft")}><span className="text-xs font-medium text-muted-foreground">{t.queda >= 0 ? "Te queda" : "Te falta"}</span><Money value={Math.abs(t.queda)} short className={cn("font-bold", t.queda >= 0 ? "text-foreground" : "text-danger")} /></div>
      </div>
      {(t.vencidoSale > 0 || t.pendienteSale > 0) && (
        <p className="text-sm text-muted-foreground" data-money>
          {t.pendienteSale > 0 && <>Falta pagar <Money value={t.pendienteSale} className="font-semibold text-foreground" />. </>}
          {t.vencidoSale > 0 && <span className="text-danger">Vencido sin registrar: <Money value={t.vencidoSale} className="font-semibold" />.</span>}
        </p>
      )}
      <div className="grid gap-1.5">
        <div className="flex flex-wrap items-baseline justify-between gap-x-2 text-sm">
          {q.presupuesto > 0
            ? <span><b>Gastado en tu presupuesto:</b> <Money value={q.gastadoPres} /> <span className="text-muted-foreground">de <Money value={q.presupuesto} />{q.conTarjetaPer > 0 ? <> (incluye <Money value={q.conTarjetaPer} /> con tarjeta)</> : null}</span></span>
            : <span><b>Gastos registrados:</b> <Money value={q.gastado} /> {q.nGastos ? <span className="text-muted-foreground">en {q.nGastos} gasto{q.nGastos === 1 ? "" : "s"}</span> : <span className="text-muted-foreground">(aún ninguno)</span>}</span>}
        </div>
        {q.presupuesto > 0 && q.momento !== "pasado" && <Progress value={usado * 100} aria-label={`Usaste el ${fmtPct(usado * 100, 0)} del presupuesto variable`} className={cn("h-2", usado >= 1 ? "[&_[data-slot=progress-indicator]]:bg-danger" : "[&_[data-slot=progress-indicator]]:bg-brand")} />}
        <p className="text-xs text-muted-foreground">{q.momento === "pasado" ? "Este mes ya terminó: cuenta solo lo que registraste." : q.porGastar > 0 ? <>Te faltan <Money value={q.porGastar} /> por gastar según tu presupuesto (ya están en «Sale»).</> : q.presupuesto > 0 ? "Ya usaste todo tu presupuesto variable del mes." : "Pon topes por categoría en Presupuesto para estimar lo que falta por gastar."}</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="outline" size="sm" onClick={onDetalle}><Icon name="list" /> Ver entradas y salidas</Button>
        <Button asChild variant="ghost" size="sm"><Link href="/dashboard"><Icon name="chart-column" /> Ver gráficas</Link></Button>
      </div>
    </Panel>
  )
}

const TONO: Record<HallazgoBalance["tono"], string> = {
  ok: "bg-success-soft text-success", warn: "bg-warning-soft text-[#B86E00] dark:text-[#FFB547]", bad: "bg-danger-soft text-danger", info: "bg-info-soft text-info",
}

/** Hallazgos del balance en palabras simples, con un acceso a lo que conviene hacer. */
export function HallazgosBalance({ list, onAgregar }: { list: HallazgoBalance[]; onAgregar: () => void }) {
  if (!list.length) return null
  return (
    <Panel title="Lo que vemos en tu balance" icon="lightbulb" info="Mirai revisa tus números y te dice en palabras simples qué va bien y qué conviene mejorar.">
      <ul className="grid gap-2">
        {list.map((h) => (
          <li key={h.id} className="flex items-start gap-3 rounded-lg bg-secondary/50 p-3">
            <span className={cn("grid size-9 shrink-0 place-items-center rounded-full", TONO[h.tono])}><Icon name={h.icon} className="size-4.5" /></span>
            <span className="grid min-w-0 gap-0.5">
              <span className="font-semibold" data-money>{h.titulo}</span>
              <span className="text-sm text-muted-foreground" data-money>{h.detalle}</span>
              {h.accion && (h.href
                ? <Link href={h.href} className="text-sm font-semibold text-link hover:underline">{h.accion} ›</Link>
                : <button type="button" onClick={onAgregar} className="justify-self-start text-sm font-semibold text-link hover:underline">{h.accion} ›</button>)}
            </span>
          </li>
        ))}
      </ul>
    </Panel>
  )
}

const COLOR: Record<string, string> = {
  dinero: "#1B7FCC", bienes: "#2E9E5B", inversiones: "#7A4BE0", "me-deben": "#C99400",
  creditos: "#D0243F", tarjetas: "#E0731A", impuestos: "#5A6C9E", otras: "#DB2777",
}

function Barra({ title, total, items, empty }: { title: string; total: number; items: ParteEstado[]; empty: string }) {
  return (
    <div className="grid gap-2">
      <div className="flex items-baseline justify-between gap-2"><p className="font-semibold">{title}</p><Money value={total} className="font-bold" /></div>
      {!items.length ? <p className="text-sm text-muted-foreground">{empty}</p> : (
        <>
          <div className="flex h-3 w-full gap-0.5 overflow-hidden rounded-full bg-secondary" role="img" aria-label={`${title}: ${items.map((x) => `${x.label} ${Math.round(x.pct * 100)} %`).join(", ")}`}>
            {items.map((x) => <span key={x.k} style={{ width: `${x.pct * 100}%`, background: COLOR[x.k] }} className="h-full first:rounded-l-full last:rounded-r-full" />)}
          </div>
          <ul className="grid gap-1.5">
            {items.map((x) => (
              <li key={x.k} className="grid grid-cols-[0.75rem_minmax(0,1fr)_auto_3rem] items-center gap-2 text-sm">
                <span className="size-3 rounded-full" style={{ background: COLOR[x.k] }} />
                <span className="truncate">{x.href ? <Link href={x.href} className="hover:text-link">{x.label}</Link> : x.label}</span>
                <Money value={x.v} short className="font-semibold" />
                <span className="text-right text-xs text-muted-foreground">{Math.round(x.pct * 100)} %</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}

/** ¿Dónde está tu plata? Composición de lo que tienes y de lo que debes. */
export function ComposicionCard({ tengo, debo, A, P }: { tengo: ParteEstado[]; debo: ParteEstado[]; A: number; P: number }) {
  return (
    <Panel title="¿Dónde está tu plata?" icon="chart-pie" info="Cómo se reparte lo que tienes (dinero, bienes, inversiones, lo que te deben) y lo que debes (créditos, tarjetas, impuestos, otras). El dinero en cuentas es el que puedes usar ya; una casa o un carro no se convierten en plata tan rápido.">
      <div className="grid gap-5">
        <Barra title="Lo que tengo" total={A} items={tengo} empty="Agrega tus cuentas, efectivo y bienes." />
        <Barra title="Lo que debo" total={P} items={debo} empty="No tienes deudas registradas. ¡Bien!" />
      </div>
    </Panel>
  )
}
