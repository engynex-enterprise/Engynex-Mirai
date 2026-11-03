"use client"

import { useId, useState } from "react"
import Link from "next/link"
import { ArrowRight, Coffee, Lock } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { formatCOP, fmtMoneyInput, parseMoney } from "@/lib/domain/money"
import { ahorro } from "@/lib/domain/calculadoras"
import { cn } from "@/lib/utils"

/** Semanas promedio de un mes (52 semanas / 12 meses). */
const SEMANAS_MES = 52 / 12

function Monto({ label, help, value, onChange }: { label: string; help: string; value: string; onChange: (v: string) => void }) {
  const id = useId()
  return (
    <div className="grid gap-1.5">
      <label htmlFor={id} className="text-sm font-medium">{label}</label>
      <div className="relative">
        <span className="pointer-events-none absolute inset-y-0 left-3 grid place-items-center text-muted-foreground">$</span>
        <Input
          id={id}
          inputMode="numeric"
          autoComplete="off"
          className="h-11 pl-7 text-base num"
          value={value}
          onChange={(e) => onChange(fmtMoneyInput(parseMoney(e.target.value)))}
          aria-describedby={`${id}-h`}
        />
      </div>
      <p id={`${id}-h`} className="text-xs text-muted-foreground">{help}</p>
    </div>
  )
}

/**
 * Demo de la portada: ¿cuánto te queda este mes? y el peso de los gastos hormiga.
 * Funciona solo en el navegador con lo que escribe la persona; no guarda ni envía nada.
 */
export function DemoQueda() {
  const [ingreso, setIngreso] = useState("2.500.000")
  const [fijos, setFijos] = useState("1.350.000")
  const [cuotas, setCuotas] = useState("300.000")
  const [hormiga, setHormiga] = useState("8.000")
  const [dias, setDias] = useState(5)

  const ing = parseMoney(ingreso)
  const comprometido = parseMoney(fijos) + parseMoney(cuotas)
  const hormigaMes = Math.round(parseMoney(hormiga) * dias * SEMANAS_MES)
  const hormigaAnio = Math.round(parseMoney(hormiga) * dias * 52)
  const queda = ing - comprometido - hormigaMes
  const pctComprometido = ing > 0 ? Math.round((comprometido / ing) * 100) : 0
  const meta20 = Math.round(ing * 0.2)
  // Si guardas la mitad de los antojos durante un año (sin rendimiento: solo lo que apartas).
  const mitad = ahorro({ inicial: 0, mensual: Math.round(hormigaMes / 2), ea: 0, meses: 12 })
  const usado = ing > 0 ? Math.min(100, Math.max(0, ((comprometido + hormigaMes) / ing) * 100)) : 0

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_1.05fr]">
      <form className="grid gap-4 rounded-2xl border bg-card p-5 shadow-card backdrop-blur sm:p-6" onSubmit={(e) => e.preventDefault()} aria-label="Tus valores del mes">
        <Monto label="¿Cuánto te entra al mes?" help="Lo que te llega después de descuentos (salario, honorarios, pensión…)." value={ingreso} onChange={setIngreso} />
        <Monto label="Gastos fijos del mes" help="Arriendo, servicios, mercado, colegio, transporte." value={fijos} onChange={setFijos} />
        <Monto label="Cuotas de deudas y tarjetas" help="Lo que pagas al mes en créditos, tarjetas y fiados." value={cuotas} onChange={setCuotas} />
        <div className="grid gap-4 rounded-xl bg-muted/60 p-4">
          <p className="flex items-center gap-2 text-sm font-semibold"><Coffee className="size-4 text-warning" aria-hidden /> Tus gastos hormiga</p>
          <Monto label="¿Cuánto gastas en antojos al día?" help="Tinto, domicilios, mecato, gaseosa…" value={hormiga} onChange={setHormiga} />
          <div className="grid gap-2">
            <div className="flex items-center justify-between text-sm"><label htmlFor="demo-dias" className="font-medium">¿Cuántos días a la semana?</label><span className="num font-semibold">{dias}</span></div>
            <input id="demo-dias" type="range" min={1} max={7} step={1} value={dias} onChange={(e) => setDias(+e.target.value)} className="h-6 w-full cursor-pointer accent-primary" />
          </div>
        </div>
        <p className="flex items-center gap-2 text-xs text-muted-foreground"><Lock className="size-3.5" aria-hidden /> Es una simulación en tu navegador: no guardamos ni enviamos nada.</p>
      </form>

      <div className="grid content-start gap-4" aria-live="polite">
        <div className="rounded-2xl bg-hero-gradient p-5 text-white shadow-float sm:p-6">
          <p className="text-sm text-white/80">Te quedan este mes</p>
          <p className={cn("num text-4xl font-bold tracking-tight sm:text-5xl", queda < 0 && "text-[#FFB4C0]")} data-testid="demo-queda">{formatCOP(queda)}</p>
          <div className="mt-4 h-2 overflow-hidden rounded-full bg-white/20" aria-hidden>
            <div className="h-full rounded-full bg-lime transition-[width] duration-500" style={{ width: `${usado}%` }} />
          </div>
          <p className="mt-2 text-sm text-white/80">
            {queda < 0 ? "No te alcanza: gastas más de lo que te entra. Mirai te ayuda a ver dónde recortar." : `Tus fijos y cuotas se llevan el ${pctComprometido} % de lo que te entra.`}
          </p>
          {pctComprometido > 50 && queda >= 0 && <p className="mt-1 text-sm font-medium text-lime">Ojo: tus compromisos pasan la mitad de tu ingreso.</p>}
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="rounded-2xl border bg-card p-4 shadow-card backdrop-blur">
            <p className="text-xs text-muted-foreground">Tus antojos al mes</p>
            <p className="num text-2xl font-bold" data-testid="demo-hormiga-mes">{formatCOP(hormigaMes)}</p>
            <p className="mt-1 text-xs text-muted-foreground">En un año son <b className="num text-foreground">{formatCOP(hormigaAnio)}</b>.</p>
          </div>
          <div className="rounded-2xl border bg-card p-4 shadow-card backdrop-blur">
            <p className="text-xs text-muted-foreground">Si guardas la mitad durante un año</p>
            <p className="num text-2xl font-bold text-success">{formatCOP(mitad.final)}</p>
            <p className="mt-1 text-xs text-muted-foreground">Apartando {formatCOP(Math.round(hormigaMes / 2))} al mes, sin contar intereses.</p>
          </div>
        </div>
        <div className="rounded-2xl border bg-card p-4 text-sm shadow-card backdrop-blur">
          <p><b>Según la regla 50/30/20</b>, lo ideal sería apartar <b className="num">{formatCOP(meta20)}</b> al mes (el 20 %) para ahorrar o pagar deudas.</p>
          <p className="mt-1 text-xs text-muted-foreground">Es un punto de partida, no una regla rígida. En Mirai lo ves con tus gastos reales, por quincena.</p>
        </div>
        <Button size="lg" asChild className="w-full sm:w-fit"><Link href="/registro">Hazlo con tus números reales <ArrowRight aria-hidden /></Link></Button>
      </div>
    </div>
  )
}
