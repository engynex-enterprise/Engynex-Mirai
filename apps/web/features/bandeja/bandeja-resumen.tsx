"use client"

// Piezas de arriba de la bandeja: indicadores con la comparación contra el periodo anterior, "¿te alcanza?", el gráfico
// de en qué se va la plata, el presupuesto por categoría y los gastos registrados dos veces. Todas las cifras llegan ya
// calculadas (use-bandeja.ts → @mirai/domain/bandeja); aquí solo se formatean.
import { useState } from "react"
import dynamic from "next/dynamic"
import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { Skeleton } from "@/components/ui/skeleton"
import { Kpi, KpiGrid } from "@/components/mirai/kpi"
import { Money } from "@/components/mirai/money"
import { Notice } from "@/components/mirai/notice"
import { Panel } from "@/components/mirai/panel"
import { Segmented } from "@/components/mirai/choice-cards"
import { StatusPill } from "@/components/mirai/status-pill"
import { ToneIcon } from "@/components/mirai/tone-icon"
import type { Cambio, TeAlcanza } from "@/lib/domain/bandeja"
import type { PosibleDoble } from "@/lib/domain/dobles"
import { fmtDate, fmtMonth, fmtPct } from "@/lib/format"
import { cn } from "@/lib/utils"
import type { Bandeja } from "./use-bandeja"

const CategoriasChart = dynamic(() => import("@/features/dashboard/charts").then((m) => m.CategoriasChart), { ssr: false, loading: () => <Skeleton className="h-48 w-full rounded-lg" aria-hidden /> })

/** "12 % más que en octubre": en gastos, subir es malo (rojo) y bajar es bueno (verde). */
function Delta({ c, antes, testId }: { c: Cambio; antes: string; testId?: string }) {
  if (c.dir === "igual") return <span data-testid={testId}>Igual que en {antes}</span>
  if (c.antes === 0) return <span data-testid={testId}>Sin datos de {antes} para comparar</span>
  const txt = c.pct == null ? <>En {antes} fue <Money value={c.antes} /></> : <>{fmtPct(Math.abs(c.pct), 0)} {c.dir === "sube" ? "más" : "menos"} que en {antes}</>
  return <span data-testid={testId} className={c.dir === "sube" ? "text-danger" : "text-success"}>{c.dir === "sube" ? "▲" : "▼"} {txt}</span>
}

export function BandejaKpis({ d, loading }: { d: Bandeja | null; loading: boolean }) {
  const R = d?.R
  return (
    <div className="grid gap-2">
      <KpiGrid cols={4}>
        <Kpi icon="layers" tone="brand" label="Sale en el periodo" loading={loading} value={<Money value={R?.total ?? 0} />}
          sub={d ? <Delta c={d.cmp.total} antes={d.antes} testId="delta-total" /> : null}
          info="Todo lo que sale en el periodo, pagado y por pagar: gastos del día a día, fijos, suscripciones, tarjetas, cuotas de deudas, impuestos y mesadas, más un estimado de lo que te queda por gastar según tu presupuesto (aún no lo has gastado). Es el mismo «Sale» del Balance." />
        <Kpi icon="circle-check" tone="green" label="Ya pagaste" loading={loading} value={<Money value={R?.pagado ?? 0} />}
          sub={d ? <Delta c={d.cmp.pagado} antes={d.antes} /> : null} />
        <Kpi icon="hourglass" tone="amber" label="Falta por pagar" loading={loading} value={<Money value={R?.porPagar ?? 0} />} sub="Lo vencido y lo que viene"
          info="Lo que todavía no has pagado en este periodo: fijos, suscripciones, tarjetas, cuotas de deudas, impuestos, mesadas y lo que te queda de tu presupuesto. La plata que te prestan o que prestas no entra acá: eso no es un gasto." />
        <Kpi icon="circle-alert" tone={R?.vencido ? "red" : "green"} label="Vencido" loading={loading} value={<Money value={R?.vencido ?? 0} />}
          valueClassName={R?.vencido ? "text-danger" : undefined} sub={R?.vencido ? `${R.nVencidos} ${R.nVencidos === 1 ? "pago" : "pagos"}: págalos cuanto antes` : "No tienes nada vencido"} />
      </KpiGrid>
      {!!d?.presupuesto && (
        <p className="text-sm text-muted-foreground" data-money data-testid="incluye-presupuesto">
          «Sale en el periodo» incluye <b className="text-foreground"><Money value={d.presupuesto} /></b> estimados de tu presupuesto (mercado, transporte…) que todavía no has gastado.
        </p>
      )}
      {!!R?.intereses && d && (
        <p className="text-sm text-muted-foreground" data-money data-testid="intereses">
          De lo que sale, <b className="text-foreground"><Money value={R.intereses} /></b> son intereses de tus deudas y tarjetas
          {d.cmp.intereses.dir !== "igual" && <> (<Delta c={d.cmp.intereses} antes={d.antes} />)</>}. Si pagas antes o abonas plata extra a la deuda, pagas menos intereses.
        </p>
      )}
    </div>
  )
}

const ALCANZA: Record<Exclude<TeAlcanza["estado"], "no-aplica" | "sin-cuentas">, { tone: "pagado" | "porVencer" | "vencido"; label: string }> = {
  alcanza: { tone: "pagado", label: "Te alcanza" },
  justo: { tone: "porVencer", label: "Te alcanza, pero justo" },
  falta: { tone: "vencido", label: "No te alcanza" },
}

/** Una línea de la cuenta de "¿Te alcanza?": signo, texto y valor. */
function Linea({ s, l, v, hint }: { s: string; l: string; v: number; hint?: React.ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3 py-1.5">
      <span className="min-w-0"><span className="mr-1.5 inline-block w-3 text-center font-bold text-muted-foreground">{s}</span>{l}{hint && <span className="block pl-[1.125rem] text-xs text-muted-foreground">{hint}</span>}</span>
      <Money value={v} className="shrink-0 font-semibold" />
    </div>
  )
}

/** ¿Te alcanza para lo que falta? Lo que tienes hoy + lo que te falta recibir − lo que te falta pagar. */
export function TeAlcanzaCard({ t, nombre }: { t: TeAlcanza; nombre: string }) {
  if (t.estado === "no-aplica") return null
  if (t.estado === "sin-cuentas") return (
    <Notice tone="info" title="¿Te alcanza para lo que falta?" action={<Button asChild size="sm" variant="outline"><Link href="/balance?nuevo=1">Agregar mis cuentas</Link></Button>}>
      Agrega tus cuentas y tu efectivo en el Balance y te decimos si lo que tienes, más lo que te falta recibir, cubre lo que te falta pagar en {nombre}.
    </Notice>
  )
  const E = ALCANZA[t.estado]
  return (
    <Panel title="¿Te alcanza?" icon="wallet" info="Lo que tienes hoy en tus cuentas y efectivo (el «Disponible ya» del Balance), más lo que te falta recibir, menos lo que te falta pagar y apartar en el periodo. Lo que debía entrarte y no ha llegado no se cuenta, ni la plata de un préstamo."
      action={<StatusPill tone={E.tone}>{E.label}</StatusPill>}>
      <div className="grid divide-y text-sm" data-money data-testid="te-alcanza">
        <Linea s="" l="Tienes hoy en tus cuentas" v={t.disponible} />
        <Linea s="+" l={`Te falta recibir en ${nombre}`} v={t.porEntrar} />
        <Linea s="−" l="Te falta pagar" v={t.porPagar} hint={t.presupuesto > 0 ? <>Incluye <Money value={t.presupuesto} /> que te quedan por gastar según tu presupuesto</> : undefined} />
        {t.ahorro > 0 && <Linea s="−" l="Lo que vas a guardar para tus metas y tu fondo" v={t.ahorro} />}
        <div className="flex items-center justify-between gap-3 pt-2.5 text-base font-bold">
          <span>{t.queda >= 0 ? "Te quedarían" : "Te faltarían"}</span>
          <Money value={Math.abs(t.queda)} className={t.queda >= 0 ? "text-success" : "text-danger"} />
        </div>
      </div>
      {t.estado === "falta" && <p className="mt-2 text-sm text-muted-foreground">Mira qué puedes aplazar, abonar en partes o pagar después de tu próximo ingreso.</p>}
    </Panel>
  )
}

/** En qué se va la plata del periodo: por módulo o por categoría (las barras suman lo que sale). */
export function DesgloseCard({ d }: { d: Bandeja }) {
  const [por, setPor] = useState<"modulo" | "cat">("modulo")
  const data = (por === "modulo" ? d.porModulo : d.porCat).slice(0, 8)
  const resto = (por === "modulo" ? d.porModulo : d.porCat).slice(8).reduce((a, p) => a + p.v, 0)
  if (!d.movs.length) return null
  return (
    <Panel title="¿En qué se va?" icon="chart-bar" info="Lo que sale en el periodo repartido por tipo de gasto o por categoría. Las barras suman lo mismo que «Sale en el periodo».">
      <div className="grid gap-3" data-testid="desglose">
        <Segmented value={por} onChange={(v) => setPor(v as typeof por)} items={[{ value: "modulo", label: "Tipo de gasto" }, { value: "cat", label: "Categoría" }]} />
        <CategoriasChart data={[...data.map((p) => ({ cat: p.label, v: p.v })), ...(resto > 0 ? [{ cat: "Otros", v: resto }] : [])]} />
        <ul className="mt-3 grid gap-1 text-sm sm:grid-cols-2" data-money>
          {data.slice(0, 4).map((p) => (
            <li key={p.k} className="flex items-center justify-between gap-2">
              <span className="truncate text-muted-foreground">{p.label}</span>
              <span className="shrink-0"><b><Money value={p.v} /></b> <span className="text-xs text-muted-foreground">· {fmtPct(p.pct * 100, 0)}</span></span>
            </li>
          ))}
        </ul>
      </div>
    </Panel>
  )
}

/** Presupuesto del mes por categoría: lo que llevas contra el tope (las mismas cifras de la sección Presupuesto). */
export function PresupuestoCard({ d }: { d: Bandeja }) {
  const filas = d.pres.slice(0, 6)
  return (
    <Panel title={`Tu presupuesto de ${fmtMonth(d.mesPres).split(" ")[0]}`} icon="target"
      info="Lo que llevas gastado en el mes en cada categoría contra el tope que le pusiste. Cuenta los gastos registrados, también las compras con tarjeta."
      action={<Button asChild size="sm" variant="ghost" className="text-link"><Link href="/presupuesto">Ver todo</Link></Button>}>
      {!filas.length ? (
        <p className="text-sm text-muted-foreground">Ponles un tope a tus categorías (mercado, transporte, gustos…) y aquí ves si vas bien. <Link href="/presupuesto" className="text-link hover:underline">Poner topes</Link></p>
      ) : (
        <ul className="grid gap-3" data-money data-testid="presupuesto">
          {filas.map((f) => (
            <li key={f.id} className="grid gap-1">
              <div className="flex items-center justify-between gap-2 text-sm">
                <span className="flex min-w-0 items-center gap-2"><ToneIcon icon={f.icon} size="sm" tone={f.st === "pasado" ? "red" : f.st === "cerca" ? "amber" : "green"} /><span className="truncate font-medium">{f.nombre}</span></span>
                <span className="shrink-0 text-right"><Money value={f.llevas} className="font-semibold" /> <span className="text-xs text-muted-foreground">de <Money value={f.tope} /></span></span>
              </div>
              <Progress value={Math.min(100, f.u)} aria-label={`${f.nombre}: ${fmtPct(f.u, 0)} del tope`} className={cn("h-1.5", f.u >= 100 ? "[&>div]:bg-danger" : f.st === "cerca" ? "[&>div]:bg-[#E08A00]" : "[&>div]:bg-lime")} />
              <span className={cn("text-xs", f.queda < 0 ? "text-danger" : "text-muted-foreground")}>
                {f.queda < 0 ? <>Te pasaste <Money value={-f.queda} /></> : <>Te quedan <Money value={f.queda} /> · {fmtPct(f.u, 0)} usado</>}
              </span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  )
}

/** Gastos sueltos que parecen el pago de un fijo (contados dos veces): enlazarlos o borrar el de más, con un toque. */
export function DoblesNotice({ list, onEnlazar, onBorrar, busy }: { list: PosibleDoble[]; onEnlazar: (x: PosibleDoble) => void; onBorrar: (x: PosibleDoble) => void; busy: string | null }) {
  if (!list.length) return null
  const total = list.reduce((a, x) => a + x.v, 0)
  return (
    <Notice tone="warn" title={list.length === 1 ? "Un gasto puede estar contado dos veces" : `${list.length} gastos pueden estar contados dos veces`}>
      <span data-money>Si son el mismo pago, «Sale en el periodo» tiene <Money value={total} /> de más. Enlázalos y salen una sola vez.</span>
      <ul className="mt-2 grid gap-2" data-testid="dobles">
        {list.map((x) => (
          <li key={x.id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-secondary px-3 py-2 text-sm text-foreground">
            <span className="min-w-0" data-money>
              «{x.descripcion}» (<Money value={x.v} />, {fmtDate(x.fecha)}) se parece al pago de tu gasto fijo «{x.fixed.nombre}»
              {x.yaPagado ? ", que ya está pagado." : "."}
            </span>
            {x.yaPagado
              ? <Button size="sm" variant="outline" disabled={busy === x.id} onClick={() => onBorrar(x)}>Borrar el gasto de más</Button>
              : <Button size="sm" disabled={busy === x.id} onClick={() => onEnlazar(x)}>Es el mismo: enlazar</Button>}
          </li>
        ))}
      </ul>
    </Notice>
  )
}
