"use client"

import Link from "next/link"
import { ChevronDown, ChevronLeft, ChevronRight } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { Money } from "@/components/mirai/money"
import { ToneIcon } from "@/components/mirai/tone-icon"
import { StatusPill, type PillTone } from "@/components/mirai/status-pill"
import { EntityLogo } from "@/components/mirai/entity-logo"
import { IconAction } from "@/components/mirai/list-row"
import { Icon } from "@/components/mirai/icon"
import { IconButton } from "@/components/mirai/tip"
import { Panel, SectionTitle } from "@/components/mirai/panel"
import { Card, CardContent } from "@/components/ui/card"
import type { HallazgoBalance } from "@/lib/domain/balance"
import { type CuentaTMes, type FilaMes, ESTADOS, MODULOS, MODULO_ORDEN, porClase, type Estado, type FlujoIntegral, type Modulo, type Mov, type ParteEstado, type PorClase } from "@/lib/domain/flujo-integral"
import { fmtDate, fmtMoney, fmtMonth, fmtPct } from "@/lib/format"
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
      <p className={cn("min-w-36 text-center font-semibold sm:min-w-44", !label && "capitalize")}>{label ?? fmtMonth(ym)}</p>
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
 * El total de la columna explicado: de qué es cada peso. Así se ve por qué el total de "Salidas" no es el mismo
 * número del KPI "Sale" (el ahorro sigue siendo tuyo y la plata que prestaste tampoco es un gasto).
 */
function DesgloseColumna({ dir, C }: { dir: "entra" | "sale"; C: PorClase }) {
  const partes = dir === "entra"
    ? [
        { k: "ingreso", l: "Ingresos y extras", v: C.ingreso, tip: "Tu sueldo, los ingresos extra y las primas del calendario.", cls: "text-success" },
        { k: "cobro", l: "Te pagan", v: C.cobro, tip: "Cuotas y abonos de lo que te deben.", cls: "text-success" },
        { k: "cred", l: "Te prestaron", v: C.credEntra, tip: "Plata prestada: no es tuya, por eso no cuenta en «Entra».", cls: "text-muted-foreground" },
        { k: "aho", l: "Sacaste del ahorro", v: C.ahorroEntra, tip: "Lo que sacaste de tus metas o de tu fondo: se resta de lo que ahorras.", cls: "text-info" },
      ]
    : [
        { k: "gasto", l: "Gastos", v: C.gasto, tip: "Consumo: gastos del día a día, fijos, suscripciones, impuestos y mesadas.", cls: "text-danger" },
        { k: "deuda", l: "Deudas", v: C.deuda, tip: "Cuotas, abonos y el pago de tus tarjetas.", cls: "text-danger" },
        { k: "aho", l: "Ahorras", v: C.ahorroSale, tip: "Metas, fondo de emergencia e inversiones: no es un gasto, sigue siendo tuyo.", cls: "text-info" },
        { k: "cred", l: "Prestaste", v: C.credSale, tip: "Plata que prestaste: te la deben, no es un gasto.", cls: "text-muted-foreground" },
      ]
  const vis = partes.filter((p) => p.v > 0)
  if (vis.length < 2) return null
  return (
    <ul className="flex flex-wrap gap-x-3 gap-y-1 pt-1 text-xs text-muted-foreground" data-money>
      {vis.map((p) => (
        <li key={p.k} title={p.tip} className="flex items-center gap-1">
          <span>{p.l}</span><Money value={p.v} short className={cn("font-semibold", p.cls)} />
        </li>
      ))}
    </ul>
  )
}

/**
 * Entradas o salidas de un periodo agrupadas por módulo (Ingresos, Gastos fijos, Tarjetas, Deudas…), cada grupo con
 * su total, el reparto por categoría y un enlace a su sección. Debajo del total, de qué es cada peso (gastos, deudas,
 * ahorro, préstamos). `abiertos`: si los grupos empiezan desplegados.
 */
export function FlujoColumna({ title, sub, dir, movs, empty, abiertos = true }: { title: string; sub: string; dir: "entra" | "sale"; movs: Mov[]; empty: React.ReactNode; abiertos?: boolean }) {
  const grupos = MODULO_ORDEN.map((k) => ({ k, l: movs.filter((x) => x.modulo === k) })).filter((g) => g.l.length)
  const C = porClase(movs)
  return (
    <div className="grid content-start gap-2">
      <div className="grid gap-0.5 border-b-[3px] border-foreground pb-2">
        <div className="flex items-end justify-between gap-2">
          <div><p className="font-semibold">{title}</p><p className="text-xs tracking-wide text-muted-foreground uppercase">{sub}</p></div>
          <Money value={C.total} className="font-bold" />
        </div>
        <DesgloseColumna dir={dir} C={C} />
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
export function MesCard({ q, prev, ym, onMove, onDetalle, canEdit }: {
  q: FlujoIntegral; /** El mismo periodo del mes pasado, para comparar. */ prev?: FlujoIntegral | null
  ym: string; onMove: (d: number) => void; onDetalle: () => void; canEdit: boolean
}) {
  const usado = q.presupuesto ? Math.min(1, (q.presupuesto - q.porGastar) / q.presupuesto) : 0
  const t = q.tot
  const base = Math.max(t.entra, t.sale + Math.max(0, t.ahorro), 1)
  const parte = (v: number) => `${Math.max(0, Math.min(100, (v / base) * 100))}%`
  // Comparación con el mes pasado (solo si hay con qué comparar).
  const cmp = prev && prev.tot.entra > 0 ? { entra: (t.entra - prev.tot.entra) / prev.tot.entra, sale: prev.tot.sale > 0 ? (t.sale - prev.tot.sale) / prev.tot.sale : null } : null
  const pct = (v: number) => `${v > 0 ? "+" : "−"}${Math.round(Math.abs(v) * 100)} %`
  return (
    <Panel title="Tu mes" icon="calendar-days" info="Todo lo que entra (ingresos, cobros, préstamos que te dieron) y todo lo que sale (gastos, fijos, suscripciones, cuotas, tarjetas, impuestos y mesadas). El ahorro va aparte porque no es gasto: sigue siendo tu plata."
      action={canEdit && <Button asChild size="sm" variant="soft"><Link href="/gastos?nuevo=1"><Icon name="plus" /> Registrar gasto</Link></Button>}>
      <MonthNav ym={ym} onMove={onMove} />

      {/* Titular: la respuesta a "¿cómo voy este mes?" en una línea */}
      <div className={cn("grid gap-1 rounded-xl p-4", t.queda >= 0 ? "bg-success-soft" : "bg-danger-soft")}>
        <span className="text-[13px] font-medium text-muted-foreground">{q.momento === "pasado" ? "Ese mes" : q.momento === "futuro" ? "Ese mes, según lo que tienes programado," : "Este mes"} {t.queda >= 0 ? "te queda" : "te falta"}</span>
        <Money value={Math.abs(t.queda)} className={cn("text-[30px] leading-9 font-extrabold tracking-tight", t.queda >= 0 ? "text-success" : "text-danger")} />
        <span className="text-[13px] text-muted-foreground" data-money>
          Entra {fmtMoney(t.entra)} · sale {fmtMoney(t.sale)}{t.ahorro > 0.5 ? ` · apartas ${fmtMoney(t.ahorro)}` : ""}
        </span>
      </div>

      {/* Cómo se reparte lo que entra */}
      {t.entra > 0 && (
        <div className="grid gap-1.5">
          <div className="flex h-3 w-full overflow-hidden rounded-full bg-secondary" role="img" aria-label={`De lo que entra, ${Math.round((t.sale / base) * 100)} % se va en pagos`}>
            <span className="bg-danger" style={{ width: parte(t.sale) }} />
            {t.ahorro > 0.5 && <span className="bg-info" style={{ width: parte(t.ahorro) }} />}
            {t.queda > 0 && <span className="bg-success" style={{ width: parte(t.queda) }} />}
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
            <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-danger" />Pagos {Math.round((t.sale / base) * 100)} %</span>
            {t.ahorro > 0.5 && <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-info" />Ahorro {Math.round((t.ahorro / base) * 100)} %</span>}
            {t.queda > 0 && <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-success" />Te queda {Math.round((t.queda / base) * 100)} %</span>}
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-2 text-center sm:grid-cols-4">
        <div className="grid gap-0.5 rounded-lg bg-success-soft p-3"><span className="text-xs font-medium text-muted-foreground">Entra</span><Money value={t.entra} short className="font-bold text-success" /></div>
        <div className="grid gap-0.5 rounded-lg bg-danger-soft p-3"><span className="text-xs font-medium text-muted-foreground">Sale</span><Money value={t.sale} short className="font-bold text-danger" /></div>
        <div className="grid gap-0.5 rounded-lg bg-info-soft p-3"><span className="text-xs font-medium text-muted-foreground">Ahorras</span><Money value={t.ahorro} short className="font-bold text-info" /></div>
        <div className={cn("grid gap-0.5 rounded-lg p-3", t.queda >= 0 ? "bg-brand-soft" : "bg-danger-soft")}><span className="text-xs font-medium text-muted-foreground">{t.queda >= 0 ? "Te queda" : "Te falta"}</span><Money value={Math.abs(t.queda)} short className={cn("font-bold", t.queda >= 0 ? "text-foreground" : "text-danger")} /></div>
      </div>

      {cmp && (
        <p className="text-sm text-muted-foreground" data-money>
          Frente al mes pasado: entra <b className={cn("text-foreground", cmp.entra > 0.005 ? "text-success" : cmp.entra < -0.005 ? "text-danger" : "")}>{pct(cmp.entra)}</b>
          {cmp.sale !== null && <> y sale <b className={cn("text-foreground", cmp.sale > 0.005 ? "text-danger" : cmp.sale < -0.005 ? "text-success" : "")}>{pct(cmp.sale)}</b></>}.
        </p>
      )}

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
        <Button asChild variant="ghost" size="sm"><Link href="/presupuesto"><Icon name="chart-pie" /> Ajustar presupuesto</Link></Button>
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

/**
 * Cuenta T del periodo: a la izquierda todo lo que entra y a la derecha todo lo que hay que pagar en él. Solo el
 * periodo (nada de patrimonio ni de lo que tienes ahorrado: eso es la foto de hoy y va en su propia tarjeta).
 */
/** Una columna de la cuenta T del periodo (lo que entra o lo que se paga), con sus filas por módulo. */
function ColumnaMes({ title, sub, filas, total, empty, tono, onModulo }: {
  title: string; sub: string; filas: FilaMes[]; total: number; empty: string; tono: "entra" | "sale"; onModulo?: (m: Modulo) => void
}) {
  return (
    <div className="grid content-start gap-1">
      <div className="border-b-[3px] border-foreground pb-2">
        <p className="font-semibold">{title}</p>
        <p className="text-xs tracking-wide text-muted-foreground uppercase">{sub}</p>
      </div>
      {!filas.length ? <p className="py-4 text-sm text-muted-foreground">{empty}</p> : filas.map((f) => (
        <button key={f.modulo} type="button" onClick={() => onModulo?.(f.modulo)} disabled={!onModulo}
          className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left transition-colors hover:bg-hover disabled:cursor-default">
          <ToneIcon icon={f.icon} tone={tono === "entra" ? "green" : "red"} size="sm" />
          <span className="grid min-w-0 flex-1">
            <span className="truncate text-[15px] font-medium">{f.label}</span>
            <span className="truncate text-xs text-muted-foreground">
              {f.n} {f.n === 1 ? "movimiento" : "movimientos"}
              {f.pendiente > 0.5 && <> · falta por {tono === "entra" ? "recibir" : "pagar"} {fmtMoney(f.pendiente)}</>}
            </span>
          </span>
          <span className="shrink-0 text-right">
            <Money value={f.v} className="font-semibold tabular-nums" />
            <span className="block text-xs text-muted-foreground tabular-nums">{Math.round(f.pct * 100)} %</span>
          </span>
        </button>
      ))}
      <div className="mt-1 flex items-center justify-between border-t-2 border-foreground pt-2">
        <span className="font-semibold">Total</span>
        <Money value={total} className={cn("text-[17px] font-bold tabular-nums", tono === "entra" ? "text-success" : "text-danger")} />
      </div>
    </div>
  )
}

export function CuentaTMesCard({ T, titulo, onModulo }: { T: CuentaTMes; titulo: string; onModulo?: (m: Modulo) => void }) {
  return (
    <Card className="shadow-card ring-0">
      <CardContent className="grid gap-6">
        <SectionTitle icon="scale" info="Es la cuenta del periodo, no la de tu patrimonio: a la izquierda todo lo que entra (sueldo, bonos, extras, lo que te pagan) y a la derecha todo lo que hay que pagar (fijos, el día a día, cuotas, tarjetas, suscripciones e impuestos). Lo que apartas para ahorrar va aparte, y lo que tienes y lo que debes están en la tarjeta de abajo.">
          Cuenta T de {titulo}
        </SectionTitle>
        <div className="grid gap-8 md:grid-cols-2">
          <ColumnaMes title="Lo que entra" sub="Entradas del periodo" filas={T.entra} total={T.totEntra} empty="Sin entradas en este periodo." tono="entra" onModulo={onModulo} />
          <ColumnaMes title="Lo que se paga" sub="Salidas del periodo" filas={T.sale} total={T.totSale} empty="Sin pagos en este periodo." tono="sale" onModulo={onModulo} />
        </div>
        <div className={cn("flex flex-wrap items-center justify-between gap-2 rounded-lg p-4", T.queda >= 0 ? "bg-success-soft" : "bg-danger-soft")}>
          <div>
            <p className="font-semibold">{T.queda >= 0 ? "Te queda" : "Te falta"}</p>
            <p className="text-sm text-muted-foreground">Lo que entra − lo que se paga{T.ahorro > 0.5 ? ` · además apartas ${fmtMoney(T.ahorro)} para ahorrar` : ""}</p>
          </div>
          <Money value={Math.abs(T.queda)} className={cn("text-[22px] font-extrabold", T.queda >= 0 ? "text-success" : "text-danger")} />
        </div>
        {T.pendienteSale > 0.5 && (
          <p className="text-sm text-muted-foreground">De lo que se paga en el periodo, <b className="text-foreground" data-money>{fmtMoney(T.pendienteSale)}</b> todavía está pendiente o vencido.</p>
        )}
      </CardContent>
    </Card>
  )
}
