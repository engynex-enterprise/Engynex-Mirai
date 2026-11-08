"use client"

import { useState } from "react"
import dynamic from "next/dynamic"
import { ExternalLink, RotateCcw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { ChoiceCards, Segmented } from "@/components/mirai/choice-cards"
import { Combobox, type Option } from "@/components/mirai/combobox"
import { Icon } from "@/components/mirai/icon"
import { BrandLogo } from "@/components/mirai/brand-logo"
import { Notice } from "@/components/mirai/notice"
import { useCanEdit } from "@/components/app/app-context"
import { categoryOptions, memberOptions, methodOptions, useCategories, useMembers, usePaymentMethods, useSettings } from "@/features/catalogs/hooks"
import { FRECS, SISTEMAS } from "@/lib/domain"
import { SettingRow, SettingSection, SettingSkeleton, SettingStack } from "../ui"
import { useBookSettingsSave } from "../prefs"
import { NumBlur } from "./finance"

const ExpenseForm = dynamic(() => import("@/features/expenses/expense-form").then((m) => m.ExpenseForm))
const FixedForm = dynamic(() => import("@/features/fixed/fixed-form").then((m) => m.FixedForm))
const IncomeForm = dynamic(() => import("@/features/incomes/income-form").then((m) => m.IncomeForm))

/** Lo que se guarda en book_settings.defaults (los formularios lo leen al abrir uno nuevo). */
export type Defaults = {
  cat?: string; medio?: string; quien?: string
  sistema?: string; frec?: string; plazo?: number
  fijo_cat?: string; fijo_medio?: string
  ing_quien?: string
}
const CUOTAS = [6, 12, 24, 36]
const SISTEMAS_DEF = (["frances", "aleman", "simple", "americano"] as const).map((k) => ({ value: k, label: SISTEMAS[k].n, desc: SISTEMAS[k].t, icon: SISTEMAS[k].icon, recommended: k === "frances" }))

/** Chips de "así empieza el formulario": ícono (o logo) y valor. */
function Preview({ items }: { items: { icon: string; label: string; brand?: string | null }[] }) {
  return (
    <ul className="flex flex-wrap gap-1.5" aria-label="Así empieza el formulario">
      {items.map((x) => (
        <li key={x.label} className="inline-flex h-8 items-center gap-1.5 rounded-full bg-secondary pr-3 pl-1 text-[13px] font-medium">
          {x.brand ? <BrandLogo k={x.brand} size={24} /> : <span className="grid size-6 place-items-center rounded-full bg-card text-brand shadow-card"><Icon name={x.icon} className="size-3.5" /></span>}
          {x.label}
        </li>
      ))}
    </ul>
  )
}

/** Pie de cada sección: vista previa y botón para abrir el formulario real. */
function Pie({ items, onOpen, abrir }: { items: { icon: string; label: string; brand?: string | null }[]; onOpen?: () => void; abrir?: string }) {
  return (
    <div className="flex flex-col gap-3 rounded-lg bg-info-soft/60 p-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="grid gap-1.5">
        <p className="text-xs font-semibold text-muted-foreground">Así empieza uno nuevo</p>
        <Preview items={items} />
      </div>
      {onOpen && <Button variant="outline" size="sm" className="w-fit shrink-0" onClick={onOpen}><ExternalLink /> {abrir}</Button>}
    </div>
  )
}

export function DefaultsTab() {
  const { data: cfg } = useSettings()
  const { data: cats = [] } = useCategories()
  const { data: medios = [] } = usePaymentMethods()
  const { data: members = [] } = useMembers()
  const save = useBookSettingsSave()
  const can = useCanEdit()
  const [abierto, setAbierto] = useState<"gasto" | "fijo" | "ingreso" | null>(null)
  const [reset, setReset] = useState(false)
  if (!cfg) return <SettingSkeleton sections={4} />
  const d = (cfg.defaults ?? {}) as Defaults
  const set = (p: Partial<Defaults>) => save.mutate({ defaults: { ...d, ...p } })

  const catOpts = categoryOptions(cats), medOpts = methodOptions(medios), memOpts = memberOptions(members)
  const opt = (o: Option[], v: string | undefined) => o.find((x) => x.value === v)
  // Valores que apuntan a algo que ya se borró (una categoría, un medio o una persona): se avisan para quitarlos.
  const rotos: { k: keyof Defaults; t: string }[] = [
    ...(d.cat && !opt(catOpts, d.cat) ? [{ k: "cat" as const, t: "la categoría de los gastos" }] : []),
    ...(d.medio && !opt(medOpts, d.medio) ? [{ k: "medio" as const, t: "el medio de pago de los gastos" }] : []),
    ...(d.quien && d.quien !== "familia" && !opt(memOpts, d.quien) ? [{ k: "quien" as const, t: "quién gasta" }] : []),
    ...(d.fijo_cat && !opt(catOpts, d.fijo_cat) ? [{ k: "fijo_cat" as const, t: "la categoría de los gastos fijos" }] : []),
    ...(d.fijo_medio && !opt(medOpts, d.fijo_medio) ? [{ k: "fijo_medio" as const, t: "el medio de pago de los gastos fijos" }] : []),
    ...(d.ing_quien && d.ing_quien !== "familia" && !opt(memOpts, d.ing_quien) ? [{ k: "ing_quien" as const, t: "quién recibe los ingresos" }] : []),
  ]
  const algo = Object.values(d).some((v) => v !== undefined && v !== "")
  const lbl = (o: Option | undefined, def: string) => o?.label ?? def
  const medioPrev = (v: string | undefined) => { const o = opt(medOpts, v) ?? medOpts[0]; return { icon: o?.icon ?? "banknote", label: o?.label ?? "Sin medio", brand: o?.brand ?? null } }
  const vivienda = cats.find((c) => c.nombre === "Vivienda")

  return (
    <SettingStack>
      {rotos.length > 0 && (
        <Notice tone="warn" title="Hay valores que ya no existen"
          action={<Button size="sm" variant="outline" disabled={!can} onClick={() => save.mutate({ defaults: Object.fromEntries(Object.entries(d).filter(([k]) => !rotos.some((r) => r.k === k))) })}>Quitarlos</Button>}>
          Se borró {rotos.map((r) => r.t).join(", ")}. Mientras tanto, los formularios usan su valor normal.
        </Notice>
      )}

      <SettingSection icon="receipt" title="Al registrar un gasto" desc="Lo que aparece ya puesto en Agregar › Gasto. Siempre lo puedes cambiar en el formulario.">
        <SettingRow title="Categoría" desc="«Que se ponga sola» la adivina por la descripción (tus reglas y la IA)."><div className="w-64"><Combobox value={d.cat || "auto"} disabled={!can} onChange={(v) => set({ cat: v === "auto" ? "" : v })} options={[{ value: "auto", label: "Que se ponga sola", icon: "wand-sparkles" }, ...catOpts]} /></div></SettingRow>
        <SettingRow title="Medio de pago"><div className="w-64"><Combobox value={d.medio || "none"} disabled={!can} onChange={(v) => set({ medio: v === "none" ? "" : v })} options={[{ value: "none", label: "El primero de la lista", icon: "list-ordered" }, ...medOpts]} /></div></SettingRow>
        <SettingRow title="¿Quién gasta?"><div className="w-64"><Combobox value={d.quien || "familia"} disabled={!can} onChange={(v) => set({ quien: v })} options={memOpts} /></div></SettingRow>
        <div className="pt-4">
          <Pie abrir="Abrir el formulario" onOpen={() => setAbierto("gasto")} items={[
            { icon: opt(catOpts, d.cat)?.icon ?? "wand-sparkles", label: lbl(opt(catOpts, d.cat), "Categoría automática") },
            medioPrev(d.medio),
            { icon: opt(memOpts, d.quien || "familia")?.icon ?? "users", label: lbl(opt(memOpts, d.quien || "familia"), "Toda la familia") },
            { icon: "calendar", label: "Fecha de hoy" },
          ]} />
        </div>
      </SettingSection>

      <SettingSection icon="calendar-clock" title="Al crear un gasto fijo" desc="Arriendo, servicios, colegio… lo que pagas cada mes.">
        <SettingRow title="Categoría"><div className="w-64"><Combobox value={d.fijo_cat || "auto"} disabled={!can} onChange={(v) => set({ fijo_cat: v === "auto" ? "" : v })} options={[{ value: "auto", label: vivienda ? "Vivienda (o la que adivine)" : "Que se ponga sola", icon: "wand-sparkles" }, ...catOpts]} /></div></SettingRow>
        <SettingRow title="Medio de pago" desc="Si no eliges uno, usa el de los gastos."><div className="w-64"><Combobox value={d.fijo_medio || "none"} disabled={!can} onChange={(v) => set({ fijo_medio: v === "none" ? "" : v })} options={[{ value: "none", label: "El mismo de los gastos", icon: "link" }, ...medOpts]} /></div></SettingRow>
        <div className="pt-4">
          <Pie abrir="Abrir el formulario" onOpen={() => setAbierto("fijo")} items={[
            { icon: opt(catOpts, d.fijo_cat)?.icon ?? vivienda?.icon ?? "wand-sparkles", label: lbl(opt(catOpts, d.fijo_cat), vivienda?.nombre ?? "Categoría automática") },
            medioPrev(d.fijo_medio || d.medio),
            { icon: "repeat", label: "Cada mes" },
          ]} />
        </div>
      </SettingSection>

      <SettingSection icon="arrow-down-to-line" title="Al registrar un ingreso">
        <SettingRow title="¿Quién lo recibe?" desc="Útil si en el hogar casi siempre registra los ingresos la misma persona."><div className="w-64"><Combobox value={d.ing_quien || "familia"} disabled={!can} onChange={(v) => set({ ing_quien: v })} options={memOpts} /></div></SettingRow>
        <div className="pt-4">
          <Pie abrir="Abrir el formulario" onOpen={() => setAbierto("ingreso")} items={[
            { icon: opt(memOpts, d.ing_quien || "familia")?.icon ?? "users", label: lbl(opt(memOpts, d.ing_quien || "familia"), "Toda la familia") },
            { icon: "coins", label: "Pesos colombianos" },
          ]} />
        </div>
      </SettingSection>

      <SettingSection icon="hand-coins" title="Al registrar un préstamo" desc="Para préstamos entre personas. Los de bancos, empeños y gota a gota traen sus propios valores.">
        <div className="grid gap-2 pb-4">
          <p className="font-medium">Sistema de cuotas</p>
          <ChoiceCards cols={2} value={d.sistema || "frances"} onChange={(v) => can && set({ sistema: v })} items={SISTEMAS_DEF} />
        </div>
        <SettingRow title="Frecuencia de pago"><div className="w-64"><Combobox value={d.frec || "mensual"} disabled={!can} onChange={(v) => set({ frec: v })} options={Object.entries(FRECS).filter(([k]) => k !== "unico").map(([value, f]) => ({ value, label: f.n }))} /></div></SettingRow>
        <SettingRow title="Número de cuotas">
          <div className="flex flex-wrap items-center gap-2">
            <Segmented value={String(d.plazo ?? 12)} onChange={(v) => set({ plazo: +v })} items={CUOTAS.map((n) => ({ value: String(n), label: String(n) }))} />
            <NumBlur label="Número de cuotas" value={+(d.plazo ?? 12)} min={1} max={360} disabled={!can} onSave={(v) => set({ plazo: v })} suffix="cuotas" />
          </div>
        </SettingRow>
        <div className="pt-4">
          <Pie items={[
            { icon: SISTEMAS[(d.sistema || "frances") as keyof typeof SISTEMAS]?.icon ?? "equal", label: SISTEMAS[(d.sistema || "frances") as keyof typeof SISTEMAS]?.n ?? "Cuota fija" },
            { icon: "calendar-range", label: FRECS[d.frec || "mensual"]?.n ?? "Mensual" },
            { icon: "list-ordered", label: `${d.plazo ?? 12} cuotas` },
          ]} />
        </div>
      </SettingSection>

      <div className="flex justify-end">
        <Button variant="ghost" disabled={!can || !algo} onClick={() => setReset(true)}><RotateCcw /> Restablecer todo</Button>
      </div>

      <AlertDialog open={reset} onOpenChange={setReset}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Restablecer los valores por defecto?</AlertDialogTitle>
            <AlertDialogDescription>Los formularios vuelven a empezar como vienen en Mirai. Tus registros no cambian.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={() => save.mutate({ defaults: {} })}>Restablecer</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {abierto === "gasto" && <ExpenseForm open onOpenChange={(o) => !o && setAbierto(null)} />}
      {abierto === "fijo" && <FixedForm open onOpenChange={(o) => !o && setAbierto(null)} />}
      {abierto === "ingreso" && <IncomeForm open onOpenChange={(o) => !o && setAbierto(null)} />}
    </SettingStack>
  )
}
