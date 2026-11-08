"use client"

import { useMemo, useState } from "react"
import Link from "next/link"
import { ArrowRight, Plus, RotateCcw, Scale } from "lucide-react"
import { useQuery } from "@/lib/query"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { Combobox } from "@/components/mirai/combobox"
import { ChoiceCards, Segmented } from "@/components/mirai/choice-cards"
import { Money } from "@/components/mirai/money"
import { MoneyAutosave } from "@/components/mirai/money-autosave"
import { MoneyInput } from "@/components/mirai/money-input"
import { Notice } from "@/components/mirai/notice"
import { StatusPill } from "@/components/mirai/status-pill"
import { ToneIcon, type IconTone } from "@/components/mirai/tone-icon"
import { IconButton } from "@/components/mirai/tip"
import { useCanEdit } from "@/components/app/app-context"
import { useBookData } from "@/features/book/use-book-data"
import { useSettings } from "@/features/catalogs/hooks"
import {
  FSP_LEY797, REPARTOS, cuadrarReparto, eaAMensual, fondoEstado, ingresoMensual, liquidez, quincenasDelMes, refPorAnio, repartoDe,
  repartoMontos, smmlvFor, uvtFor, type NominaCfg, type Pct,
} from "@/lib/domain"
import { fmtDate, fmtMoney, todayISO } from "@/lib/format"
import { cn } from "@/lib/utils"
import { fetchLatestRefs } from "../api"
import { SettingRow, SettingSection, SettingSkeleton, SettingStack } from "../ui"
import { useBookSettingsSave } from "../prefs"

/** Campo numérico que guarda al salir. */
export function NumBlur({ value, onSave, min, max, label, suffix, step, disabled }: { value: number; onSave: (v: number) => void; min: number; max: number; label: string; suffix?: string; step?: number; disabled?: boolean }) {
  const [v, setV] = useState(String(value))
  const [prev, setPrev] = useState(value)
  if (!Object.is(prev, value)) { setPrev(value); setV(String(value)) }
  return (
    <div className="flex items-center gap-2">
      <Input type="number" inputMode="decimal" min={min} max={max} step={step ?? 1} className="h-10 w-24" aria-label={label} value={v} disabled={disabled} onChange={(e) => setV(e.target.value)}
        onBlur={() => { const n = Math.max(min, Math.min(max, Number(v.replace(",", ".")) || 0)); setV(String(n)); if (n !== value) onSave(n) }} />
      {suffix && <span className="text-sm text-muted-foreground">{suffix}</span>}
    </div>
  )
}

function useLatestRefs() {
  return useQuery({ queryKey: ["refs-latest"], staleTime: 3_600_000, queryFn: fetchLatestRefs })
}

/** Necesidades, gustos y ahorro: mismos colores e íconos que Presupuesto. */
const PARTES: { k: keyof Pct; t: string; icon: string; tone: IconTone; bar: string; d: string }[] = [
  { k: "n", t: "Necesidades", icon: "house", tone: "navy", bar: "bg-[#1F2B4B] dark:bg-[#8C9CC4]", d: "Arriendo, mercado, servicios, transporte, salud" },
  { k: "g", t: "Gustos", icon: "coffee", tone: "brand", bar: "bg-[#9EDB4E]", d: "Restaurantes, salidas, ropa, suscripciones" },
  { k: "a", t: "Ahorro", icon: "piggy-bank", tone: "green", bar: "bg-[#3F7A1E] dark:bg-[#5FAF33]", d: "Fondo, metas e inversiones" },
]
const MESES_FONDO = [3, 6, 9, 12]
const fmtPctN = (n: number) => `${String(n).replace(".", ",")} %`

export function FinanzasTab() {
  const { data: cfg } = useSettings()
  const { data: refs } = useLatestRefs()
  const { data: book } = useBookData()
  const save = useBookSettingsSave()
  const can = useCanEdit()
  const today = todayISO()
  const year = Number(today.slice(0, 4))
  const datos = useMemo(() => {
    if (!book) return null
    const ing = ingresoMensual(book.incomes, book.settings.trm)
    const FE = fondoEstado(book, today, liquidez(book.assets, book.investments, book.settings.trm, today), book.fund)
    return { ing, FE }
  }, [book, today])
  if (!cfg) return <SettingSkeleton sections={4} />

  const pct = cfg.pct as Pct
  const trm = cfg.trm as Record<string, number>
  const smmlv = (cfg.smmlv ?? {}) as Record<string, number>
  const uvt = (cfg.uvt ?? {}) as Record<string, number>
  const refSm = refPorAnio(refs?.smmlv), refUv = refPorAnio(refs?.uvt)
  const smOficial = smmlvFor(year, null, refSm), uvOficial = uvtFor(year, null, refUv)
  const sm = smmlvFor(year, smmlv, refSm), uv = uvtFor(year, uvt, refUv)
  const smPropio = !!+smmlv[year] && +smmlv[year] !== smOficial
  const uvPropio = !!+uvt[year] && +uvt[year] !== uvOficial
  const fuente = (rows: LatestRefsRows | undefined) => rows?.find((r) => r.year === year)?.fuente
  const sinAnio = (o: Record<string, number>) => Object.fromEntries(Object.entries(o).filter(([k]) => k !== String(year)))

  return (
    <SettingStack>
      <ul className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2 2xl:grid-cols-4" aria-label="Resumen">
        {[
          { icon: "banknote", tone: "green" as IconTone, t: `Salario mínimo ${year}`, v: <Money value={sm} />, s: smPropio ? "Valor tuyo" : "Oficial" },
          { icon: "landmark", tone: "blue" as IconTone, t: `UVT ${year}`, v: <Money value={uv} />, s: uvPropio ? "Valor tuyo" : "Oficial (DIAN)" },
          { icon: "dollar-sign", tone: "amber" as IconTone, t: "Dólar (TRM)", v: <Money value={+trm.USD} />, s: cfg.trm_auto ? (refs?.trm ? `Oficial, ${fmtDate(refs.trm.fecha)}` : "Se actualiza solo") : "Lo pusiste tú" },
          { icon: "scale", tone: "red" as IconTone, t: "Tasa de usura", v: `${fmtPctN(+cfg.usura)} E.A.`, s: `${fmtPctN(eaAMensual(+cfg.usura))} al mes` },
        ].map((k) => (
          <li key={k.t} className="flex min-w-0 items-center gap-3 rounded-lg bg-card p-3 shadow-card">
            <ToneIcon icon={k.icon} tone={k.tone} size="md" />
            <div className="grid min-w-0 gap-0.5">
              <span className="truncate text-xs font-medium text-muted-foreground">{k.t}</span>
              <span className="truncate text-[17px] leading-6 font-bold">{k.v}</span>
              <span className="truncate text-xs text-muted-foreground">{k.s}</span>
            </div>
          </li>
        ))}
      </ul>

      <SettingSection icon="landmark" title={`Valores oficiales ${year}`} desc="Ya vienen con los valores oficiales. Cámbialos solo si el Gobierno publica uno nuevo y Mirai aún no lo tiene.">
        <SettingRow title="Salario mínimo (SMMLV)" desc={<>Para el fondo de solidaridad, la base de independientes y las primas. {smPropio ? <>El oficial es <b data-money>{fmtMoney(smOficial)}</b>.</> : fuente(refs?.smmlv) ? `Fuente: ${fuente(refs?.smmlv)}.` : null}</>}>
          <div className="flex flex-wrap items-center gap-2">
            <div className="w-48"><MoneyAutosave value={sm} onSave={(v) => save.mutate({ smmlv: { ...smmlv, [year]: v } })} /></div>
            {smPropio ? <Button variant="ghost" size="sm" disabled={!can} onClick={() => save.mutate({ smmlv: sinAnio(smmlv) })}><RotateCcw /> Usar el oficial</Button> : <StatusPill tone="ok" check>Oficial</StatusPill>}
          </div>
        </SettingRow>
        <SettingRow title="Valor de la UVT" desc={<>Unidad de la DIAN para topes de renta y retención. {uvPropio ? <>La oficial es <b data-money>{fmtMoney(uvOficial)}</b>.</> : fuente(refs?.uvt) ? `Fuente: ${fuente(refs?.uvt)}.` : null}</>}>
          <div className="flex flex-wrap items-center gap-2">
            <div className="w-48"><MoneyAutosave value={uv} onSave={(v) => save.mutate({ uvt: { ...uvt, [year]: v } })} /></div>
            {uvPropio ? <Button variant="ghost" size="sm" disabled={!can} onClick={() => save.mutate({ uvt: sinAnio(uvt) })}><RotateCcw /> Usar la oficial</Button> : <StatusPill tone="ok" check>Oficial</StatusPill>}
          </div>
        </SettingRow>
        <div className="grid gap-2 pt-4">
          <p className="text-sm font-semibold">¿Cuánto es en pesos?</p>
          <ul className="grid gap-2 sm:grid-cols-3" aria-label="Equivalencias en pesos">
            {[
              ["4 salarios mínimos", sm * 4, "Desde aquí se descuenta el Fondo de Solidaridad Pensional."],
              ["1.400 UVT", uv * 1400, `Si tus ingresos de ${year} pasan esto, revisa si debes declarar renta.`],
              ["4.500 UVT", uv * 4500, `Tope de patrimonio al 31 de diciembre de ${year} para declarar.`],
            ].map(([t, v, d]) => (
              <li key={t as string} className="grid gap-0.5 rounded-lg bg-secondary/60 p-3">
                <span className="text-xs font-semibold text-muted-foreground">{t}</span>
                <span className="text-[17px] font-bold"><Money value={v as number} /></span>
                <span className="text-xs text-muted-foreground">{d}</span>
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted-foreground">Valores estimados. Las reglas exactas para declarar están en <Link href="/renta" className="font-semibold text-link hover:underline">Renta</Link>.</p>
        </div>
      </SettingSection>

      <RepartoSection pct={pct} ing={datos?.ing ?? null} can={can} onSave={(p) => save.mutate({ pct: p })} />

      <SettingSection icon="calendar-range" title="Quincenas y fondo de emergencia">
        <SettingRow title="Corte de la primera quincena" desc="Día del mes en que termina la primera quincena. Los reportes y el flujo de caja cortan ahí.">
          <NumBlur label="Corte de la primera quincena" value={cfg.corte_q} min={1} max={27} disabled={!can} onSave={(v) => save.mutate({ corte_q: v })} suffix="de cada mes" />
        </SettingRow>
        <QuincenasBar corte={cfg.corte_q} today={today} />
        <SettingRow title="Meses de fondo de emergencia" desc="Cuántos meses de gastos básicos quieres tener guardados. Lo recomendado: entre 3 y 6.">
          <div className="flex flex-wrap items-center gap-2">
            <Segmented value={String(cfg.emerg_meta)} onChange={(v) => save.mutate({ emerg_meta: +v })} items={MESES_FONDO.map((m) => ({ value: String(m), label: `${m} meses` }))} />
            {!MESES_FONDO.includes(cfg.emerg_meta) && <NumBlur label="Meses de fondo de emergencia" value={cfg.emerg_meta} min={1} max={36} disabled={!can} onSave={(v) => save.mutate({ emerg_meta: v })} suffix="meses" />}
          </div>
        </SettingRow>
        {datos && <FondoMeta FE={datos.FE} meses={cfg.emerg_meta} />}
      </SettingSection>

      <NominaSection value={(cfg.nomina ?? {}) as NominaCfg} can={can} onSave={(nomina) => save.mutate({ nomina: nomina as never })} />

      <SettingSection icon="dollar-sign" title="Monedas" desc="Para pasar a pesos las cuentas, inversiones e ingresos en dólares o euros.">
        <SettingRow title="Actualizar solos con la TRM del día" desc={refs?.trm ? `Última TRM oficial: ${fmtMoney(Number(refs.trm.valor))} (${fmtDate(refs.trm.fecha)}, Superfinanciera).` : "Se actualiza cada día desde la Superfinanciera."}>
          <Switch checked={cfg.trm_auto} disabled={!can} onCheckedChange={(v) => save.mutate({ trm_auto: v })} aria-label="Actualizar la TRM sola" />
        </SettingRow>
        <SettingRow title="Dólar hoy (TRM)" desc={cfg.trm_auto ? "Si lo cambias a mano, deja de actualizarse solo." : undefined}><div className="w-48"><MoneyAutosave value={+trm.USD} onSave={(v) => save.mutate({ trm: { ...trm, USD: v }, trm_auto: false })} /></div></SettingRow>
        <SettingRow title="Euro hoy"><div className="w-48"><MoneyAutosave value={+trm.EUR} onSave={(v) => save.mutate({ trm: { ...trm, EUR: v }, trm_auto: false })} /></div></SettingRow>
        <Conversor trm={trm} />
      </SettingSection>

      <SettingSection icon="scale" title="Tasa de usura" desc="La tasa máxima que la ley permite cobrar en un préstamo. Mirai te avisa si uno de tus préstamos la supera.">
        <SettingRow title="Actualizar sola cada mes" desc={refs?.usura ? `Vigente: ${fmtPctN(refs.usura.tasa_ea)} E.A. desde ${fmtDate(refs.usura.desde)} (Superfinanciera).` : "Se toma de la Superfinanciera."}>
          <Switch checked={cfg.usura_auto} disabled={!can} onCheckedChange={(v) => save.mutate({ usura_auto: v })} aria-label="Actualizar la usura sola" />
        </SettingRow>
        <SettingRow title="Tasa de usura (% E.A.)" desc={`Equivale a ${fmtPctN(eaAMensual(+cfg.usura))} mensual (M.V.). Si un préstamo cobra más que esto, es ilegal.`}>
          <NumBlur label="Tasa de usura" value={+cfg.usura} min={0} max={100} step={0.01} disabled={!can} onSave={(v) => save.mutate({ usura: v, usura_auto: false })} suffix="% E.A." />
        </SettingRow>
      </SettingSection>
    </SettingStack>
  )
}
type LatestRefsRows = { year: number; fuente: string | null }[]

/** Reparto del ingreso (50/30/20 u otro): plantillas, barra de colores y cuánto es en pesos con tu ingreso. */
function RepartoSection({ pct, ing, can, onSave }: { pct: Pct; ing: number | null; can: boolean; onSave: (p: Pct) => void }) {
  const p = { n: +pct.n, g: +pct.g, a: +pct.a }
  const sum = p.n + p.g + p.a
  const actual = repartoDe(p) ?? "propio"
  const m = ing ? repartoMontos(ing, p) : null
  const set = (k: keyof Pct, v: number) => onSave({ ...p, [k]: v })
  return (
    <SettingSection icon="chart-pie" title="Cómo repartir tu ingreso" desc="Qué parte va a lo necesario, a los gustos y al ahorro. Presupuesto y el consejero usan este reparto."
      action={<Button variant="ghost" size="sm" asChild><Link href="/presupuesto">Ver presupuesto <ArrowRight /></Link></Button>}>
      <ChoiceCards cols={4} value={actual} onChange={(k) => { const r = REPARTOS.find((x) => x.k === k); if (r && can) onSave(r.pct) }}
        items={[...REPARTOS.map((r) => ({ value: r.k, label: r.label, desc: r.desc, recommended: r.k === "50-30-20" })), { value: "propio", label: "Propio", desc: "Escribe tus porcentajes abajo." }]} />

      <div className="grid gap-2 pt-5">
        <div className="flex h-4 w-full overflow-hidden rounded-full bg-secondary" role="img" aria-label={`Necesidades ${p.n} %, gustos ${p.g} %, ahorro ${p.a} %`}>
          {PARTES.map((x) => <span key={x.k} className={cn("h-full transition-[width] duration-300", x.bar)} style={{ width: `${(p[x.k] / Math.max(100, sum)) * 100}%` }} />)}
        </div>
        {ing ? <p className="text-xs text-muted-foreground">Con tu ingreso de <b data-money>{fmtMoney(ing)}</b> al mes:</p>
          : ing === 0 ? <p className="text-xs text-muted-foreground">Registra tus <Link href="/ingresos" className="font-semibold text-link hover:underline">ingresos</Link> para ver cuánto es en pesos.</p> : null}
      </div>

      <ul className="grid pt-2" aria-label="Reparto">
        {PARTES.map((x) => (
          <li key={x.k} className="grid grid-cols-[auto_1fr] items-center gap-x-3 gap-y-2 border-b py-3 last:border-0 sm:grid-cols-[auto_1fr_auto_8.5rem]">
            <span className={cn("block h-9 w-1.5 rounded-full", x.bar)} aria-hidden />
            <div className="flex min-w-0 items-center gap-2.5">
              <ToneIcon icon={x.icon} tone={x.tone} size="sm" />
              <div className="grid min-w-0"><span className="font-semibold">{x.t}</span><span className="truncate text-xs text-muted-foreground">{x.d}</span></div>
            </div>
            <div className="col-start-2 flex items-center justify-between gap-3 sm:col-start-auto sm:contents">
              <NumBlur label={`Porcentaje de ${x.t.toLowerCase()}`} value={p[x.k]} min={0} max={100} disabled={!can} onSave={(v) => set(x.k, v)} suffix="%" />
              <span className="text-right font-bold tabular-nums">{m ? <Money value={m[x.k]} /> : null}</span>
            </div>
          </li>
        ))}
      </ul>
      {sum !== 100 && (
        <Notice tone="warn" title={`Los porcentajes suman ${sum} %`} className="mt-3"
          action={<Button size="sm" variant="outline" disabled={!can} onClick={() => onSave(cuadrarReparto(p, "n"))}><Scale /> Cuadrar a 100 %</Button>}>
          Deben sumar 100 %. Cuadrar ajusta el ahorro (y si no alcanza, los gustos).
        </Notice>
      )}
    </SettingSection>
  )
}

/** Cómo queda el mes con el corte elegido: dos tramos con sus días. */
function QuincenasBar({ corte, today }: { corte: number; today: string }) {
  const y = +today.slice(0, 4), mo = +today.slice(5, 7), dia = +today.slice(8, 10)
  const { q1, q2 } = quincenasDelMes(corte, y, mo)
  const ult = q2[1]
  const mes = new Date(y, mo - 1, 1).toLocaleDateString("es-CO", { month: "long" })
  return (
    <div className="grid gap-2 border-b pb-4" aria-label="Quincenas de este mes">
      <div className="relative flex h-9 overflow-hidden rounded-lg text-xs font-semibold">
        <span className="grid place-items-center bg-brand-soft text-forest dark:text-lime" style={{ width: `${(q1[1] / ult) * 100}%` }}>1.ª · del {q1[0]} al {q1[1]}</span>
        <span className="grid place-items-center bg-info-soft text-info" style={{ width: `${((q2[1] - q2[0] + 1) / ult) * 100}%` }}>2.ª · del {q2[0]} al {q2[1]}</span>
        <span aria-hidden className="absolute inset-y-0 w-0.5 bg-foreground/70" style={{ left: `${((dia - 0.5) / ult) * 100}%` }} />
      </div>
      <p className="text-xs text-muted-foreground">Así queda {mes}: hoy es {dia} (la rayita), {dia <= q1[1] ? "primera" : "segunda"} quincena.</p>
    </div>
  )
}

/** Meta del fondo en pesos y cuánto llevas (la misma cuenta de Metas y el Dashboard). */
function FondoMeta({ FE, meses }: { FE: ReturnType<typeof fondoEstado>; meses: number }) {
  if (!FE.basicos) return <p className="pt-3 text-sm text-muted-foreground">Cuando registres tus gastos fijos o los topes de necesidades, aquí verás cuánto es tu meta en pesos.</p>
  const meta = FE.basicos * meses
  const avance = meta ? Math.min(100, (FE.tiene / meta) * 100) : 0
  return (
    <div className="grid gap-2 pt-4">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="text-sm">Tu meta: <b data-money>{fmtMoney(meta)}</b> <span className="text-muted-foreground">({meses} × {fmtMoney(FE.basicos)} de gastos básicos)</span></p>
        <Link href="/metas" className="text-sm font-semibold text-link hover:underline">Ir al fondo</Link>
      </div>
      <Progress value={avance} aria-label={`Fondo de emergencia: ${Math.round(avance)} %`} className="h-2 [&>div]:bg-success" />
      <p className="text-xs text-muted-foreground">{FE.enFondo ? "En tu fondo" : "Entre cuentas y efectivo"} tienes <b data-money>{fmtMoney(FE.tiene)}</b>: aguantas {FE.meses.toFixed(1).replace(".", ",")} meses sin ingresos.{FE.tiene < meta ? <> Te faltan <b data-money>{fmtMoney(meta - FE.tiene)}</b>.</> : " ¡Meta cumplida!"}</p>
    </div>
  )
}

/** Conversor rápido de dólares o euros a pesos con la tasa de arriba. */
function Conversor({ trm }: { trm: Record<string, number> }) {
  const [mon, setMon] = useState<"USD" | "EUR">("USD")
  const [v, setV] = useState(100)
  const tasa = +trm[mon] || 0
  return (
    <div className="grid gap-2 border-t pt-4">
      <p className="text-sm font-semibold">Conversor</p>
      <div className="flex flex-wrap items-center gap-2">
        <Segmented value={mon} onChange={(x) => setMon(x as "USD" | "EUR")} items={[{ value: "USD", label: "Dólares" }, { value: "EUR", label: "Euros" }]} />
        <div className="w-40"><MoneyInput value={v} onChange={setV} currency={mon} decimals aria-label={`Valor en ${mon === "USD" ? "dólares" : "euros"}`} /></div>
        <span className="text-sm text-muted-foreground">=</span>
        <span className="text-lg font-bold" aria-live="polite"><Money value={Math.round(v * tasa)} /></span>
      </div>
    </div>
  )
}

/**
 * Nómina: el procedimiento de retención que usa tu empresa (los dos son de ley, arts. 385 y 386 del Estatuto
 * Tributario) y la tabla del Fondo de Solidaridad Pensional (por defecto la de la Ley 797 de 2003).
 */
function NominaSection({ value, can, onSave }: { value: NominaCfg; can: boolean; onSave: (v: NominaCfg) => void }) {
  const tabla = value.fsp?.length ? value.fsp : FSP_LEY797
  const propia = !!value.fsp?.length
  const setFila = (i: number, j: 0 | 1, n: number) => onSave({ ...value, fsp: tabla.map((f, k) => (k === i ? (j === 0 ? [n, f[1]] : [f[0], n]) : f)) as [number, number][] })
  return (
    <SettingSection icon="briefcase" title="Nómina (descuentos de empleados)" desc="Reglas nacionales que aplican a cualquier empresa. Se usan al calcular lo que te llega de un salario.">
      <SettingRow title="Retención en la fuente: procedimiento" desc={<>Los dos son de ley y tu empresa escoge uno. El <b>1</b> usa la tabla del art. 383 cada mes. En el <b>2</b> la empresa calcula un porcentaje fijo en junio y diciembre y lo pone en tu desprendible (p. ej. &quot;Procedimiento 2, 4,38 %&quot;). Si no sabes, deja el 1.</>}>
        <div className="flex flex-wrap items-center gap-2">
          <div className="w-64"><Combobox value={value.retModo ?? "auto"} disabled={!can} onChange={(v) => onSave({ ...value, retModo: (v as NominaCfg["retModo"]) ?? "auto" })}
            options={[{ value: "auto", label: "Procedimiento 1 (tabla)" }, { value: "proc2", label: "Procedimiento 2 (% fijo)" }]} /></div>
          {value.retModo === "proc2" && <NumBlur label="Porcentaje del procedimiento 2" value={value.retPct ?? 0} min={0} max={39} step={0.01} disabled={!can} onSave={(v) => onSave({ ...value, retPct: v })} suffix="%" />}
        </div>
      </SettingRow>
      <div className="grid gap-3 pt-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="grid gap-0.5">
            <p className="font-medium">Fondo de Solidaridad Pensional</p>
            <p className="text-sm text-muted-foreground">Se descuenta si ganas 4 salarios mínimos o más. Cámbiala solo si cambia la ley (por ejemplo, con la reforma pensional) o tu desprendible muestra otro porcentaje.</p>
          </div>
          <StatusPill tone={propia ? "warn" : "ok"} check={!propia}>{propia ? "Tabla propia" : "Ley 797 de 2003"}</StatusPill>
        </div>
        <div className="overflow-hidden rounded-lg ring-1 ring-border">
          <div className="grid grid-cols-[1fr_1fr_2.5rem] gap-2 bg-secondary/60 px-3 py-2 text-xs font-semibold text-muted-foreground" aria-hidden><span>Desde (salarios mínimos)</span><span>Porcentaje</span><span /></div>
          <ul aria-label="Tabla del Fondo de Solidaridad Pensional">
            {tabla.map(([desde, pct], i) => (
              <li key={i} className="grid grid-cols-[1fr_1fr_2.5rem] items-center gap-2 border-t px-3 py-2">
                <NumBlur label={`Desde cuántos salarios mínimos, fila ${i + 1}`} value={desde} min={0} max={100} step={0.5} disabled={!can} onSave={(v) => setFila(i, 0, v)} suffix="SMMLV" />
                <NumBlur label={`Porcentaje, fila ${i + 1}`} value={pct} min={0} max={10} step={0.1} disabled={!can} onSave={(v) => setFila(i, 1, v)} suffix="%" />
                <IconButton label={`Quitar fila ${i + 1}`} icon="trash-2" destructive onClick={() => onSave({ ...value, fsp: tabla.filter((_, k) => k !== i) })} disabled={!can || tabla.length <= 1} />
              </li>
            ))}
          </ul>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" disabled={!can} onClick={() => onSave({ ...value, fsp: [...tabla, [(tabla.at(-1)?.[0] ?? 3) + 1, tabla.at(-1)?.[1] ?? 1]] })}><Plus /> Agregar fila</Button>
          {propia && <Button variant="ghost" size="sm" disabled={!can} onClick={() => onSave({ ...value, fsp: undefined })}><RotateCcw /> Volver a la tabla de ley</Button>}
        </div>
      </div>
    </SettingSection>
  )
}

