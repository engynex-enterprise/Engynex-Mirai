"use client"

import { useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import { Combobox } from "@/components/mirai/combobox"
import { MoneyAutosave } from "@/components/mirai/money-autosave"
import { Notice } from "@/components/mirai/notice"
import { createClient } from "@/utils/supabase/client"
import { categoryOptions, memberOptions, methodOptions, useCategories, useMembers, usePaymentMethods, useSettings } from "@/features/catalogs/hooks"
import { FRECS, FSP_LEY797, SISTEMAS, smmlvFor, uvtFor, type NominaCfg } from "@/lib/domain"
import { Plus, RotateCcw, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { fmtDate } from "@/lib/format"
import { SettingRow, SettingSection } from "../ui"
import { useBookSettingsSave } from "../prefs"

/** Campo numérico que guarda al salir. */
function NumBlur({ value, onSave, min, max, label, suffix, step }: { value: number; onSave: (v: number) => void; min: number; max: number; label: string; suffix?: string; step?: number }) {
  const [v, setV] = useState(String(value))
  const [prev, setPrev] = useState(value)
  if (!Object.is(prev, value)) { setPrev(value); setV(String(value)) }
  return (
    <div className="flex items-center gap-2">
      <Input type="number" inputMode="decimal" min={min} max={max} step={step ?? 1} className="h-10 w-24" aria-label={label} value={v} onChange={(e) => setV(e.target.value)}
        onBlur={() => { const n = Math.max(min, Math.min(max, Number(v.replace(",", ".")) || 0)); setV(String(n)); if (n !== value) onSave(n) }} />
      {suffix && <span className="text-sm text-muted-foreground">{suffix}</span>}
    </div>
  )
}

function useLatestRefs() {
  return useQuery({
    queryKey: ["refs-latest"],
    staleTime: 3_600_000,
    queryFn: async () => {
      const sb = createClient()
      const [trm, usura] = await Promise.all([
        sb.from("ref_trm").select("fecha,valor").order("fecha", { ascending: false }).limit(1).maybeSingle(),
        sb.from("ref_usury_rate").select("desde,hasta,tasa_ea").order("desde", { ascending: false }).limit(1).maybeSingle(),
      ])
      return { trm: trm.data, usura: usura.data }
    },
  })
}

export function FinanzasTab() {
  const { data: cfg } = useSettings()
  const { data: refs } = useLatestRefs()
  const save = useBookSettingsSave()
  if (!cfg) return <Skeleton className="h-96 w-full" />
  const year = new Date().getFullYear()
  const pct = cfg.pct as { n: number; g: number; a: number }
  const trm = cfg.trm as Record<string, number>
  const sum = +pct.n + +pct.g + +pct.a
  const smmlv = cfg.smmlv as Record<string, number>
  const uvt = cfg.uvt as Record<string, number>

  return (
    <div className="grid gap-4">
      <SettingSection icon="landmark" title={`Valores oficiales ${year}`} desc="Ya vienen con los valores oficiales. Cámbialos solo si el Gobierno publica uno nuevo.">
        <SettingRow title="Salario mínimo (SMMLV)" desc="Se usa para el fondo de solidaridad y la base mínima de independientes."><div className="w-48"><MoneyAutosave value={smmlvFor(year, smmlv)} onSave={(v) => save.mutate({ smmlv: { ...smmlv, [year]: v } })} /></div></SettingRow>
        <SettingRow title="Valor de la UVT" desc="Unidad de la DIAN para topes de renta y retención."><div className="w-48"><MoneyAutosave value={uvtFor(year, uvt)} onSave={(v) => save.mutate({ uvt: { ...uvt, [year]: v } })} /></div></SettingRow>
      </SettingSection>

      <NominaSection value={(cfg.nomina ?? {}) as NominaCfg} onSave={(nomina) => save.mutate({ nomina: nomina as never })} />

      <SettingSection icon="calendar-range" title="Quincenas y fondo de emergencia">
        <SettingRow title="Corte de la primera quincena" desc="Día del mes en que termina la primera quincena."><NumBlur label="Corte de la primera quincena" value={cfg.corte_q} min={1} max={27} onSave={(v) => save.mutate({ corte_q: v })} suffix="de cada mes" /></SettingRow>
        <SettingRow title="Meses de fondo de emergencia" desc="Lo recomendado es entre 3 y 6 meses de tus gastos."><NumBlur label="Meses de fondo de emergencia" value={cfg.emerg_meta} min={1} max={24} onSave={(v) => save.mutate({ emerg_meta: v })} suffix="meses" /></SettingRow>
      </SettingSection>

      <SettingSection icon="chart-pie" title="Regla 50/30/20" desc="Cómo repartir tus ingresos entre necesidades, gustos y ahorro.">
        <SettingRow title="Necesidades"><NumBlur label="Porcentaje de necesidades" value={+pct.n} min={0} max={100} onSave={(v) => save.mutate({ pct: { ...pct, n: v } })} suffix="%" /></SettingRow>
        <SettingRow title="Gustos"><NumBlur label="Porcentaje de gustos" value={+pct.g} min={0} max={100} onSave={(v) => save.mutate({ pct: { ...pct, g: v } })} suffix="%" /></SettingRow>
        <SettingRow title="Ahorro"><NumBlur label="Porcentaje de ahorro" value={+pct.a} min={0} max={100} onSave={(v) => save.mutate({ pct: { ...pct, a: v } })} suffix="%" /></SettingRow>
        {sum !== 100 && <Notice tone="warn" title={`Los porcentajes suman ${sum} %`} className="mt-2">Ajústalos para que sumen 100 %.</Notice>}
      </SettingSection>

      <SettingSection icon="dollar-sign" title="Monedas" desc="Para convertir a pesos las cuentas en dólares o euros.">
        <SettingRow title="Actualizar solos con la TRM del día" desc={refs?.trm ? `Última TRM oficial: $ ${Number(refs.trm.valor).toLocaleString("es-CO")} (${fmtDate(refs.trm.fecha)}).` : "Se actualiza cada día desde la Superfinanciera."}>
          <Switch checked={cfg.trm_auto} onCheckedChange={(v) => save.mutate({ trm_auto: v })} aria-label="Actualizar la TRM sola" />
        </SettingRow>
        <SettingRow title="Dólar hoy (TRM)"><div className="w-48"><MoneyAutosave value={+trm.USD} onSave={(v) => save.mutate({ trm: { ...trm, USD: v }, trm_auto: false })} /></div></SettingRow>
        <SettingRow title="Euro hoy"><div className="w-48"><MoneyAutosave value={+trm.EUR} onSave={(v) => save.mutate({ trm: { ...trm, EUR: v }, trm_auto: false })} /></div></SettingRow>
      </SettingSection>

      <SettingSection icon="scale" title="Tasa de usura" desc="La tasa máxima que la ley permite cobrar. Mirai te avisa si un préstamo la supera.">
        <SettingRow title="Actualizar sola cada mes" desc={refs?.usura ? `Vigente: ${String(refs.usura.tasa_ea).replace(".", ",")} % E.A. desde ${fmtDate(refs.usura.desde)} (Superfinanciera).` : "Se toma de la Superfinanciera."}>
          <Switch checked={cfg.usura_auto} onCheckedChange={(v) => save.mutate({ usura_auto: v })} aria-label="Actualizar la usura sola" />
        </SettingRow>
        <SettingRow title="Tasa de usura (% E.A.)" desc="Cambia cada mes; verifícala en la Superfinanciera."><NumBlur label="Tasa de usura" value={+cfg.usura} min={0} max={100} step={0.01} onSave={(v) => save.mutate({ usura: v, usura_auto: false })} suffix="% E.A." /></SettingRow>
      </SettingSection>
    </div>
  )
}

export function DefaultsTab() {
  const { data: cfg } = useSettings()
  const { data: cats } = useCategories()
  const { data: medios } = usePaymentMethods()
  const { data: members } = useMembers()
  const save = useBookSettingsSave()
  if (!cfg) return <Skeleton className="h-80 w-full" />
  const d = cfg.defaults as { cat?: string; medio?: string; quien?: string; sistema?: string; frec?: string; plazo?: number }
  const set = (p: Partial<typeof d>) => save.mutate({ defaults: { ...d, ...p } })
  return (
    <div className="grid gap-4">
      <SettingSection icon="receipt" title="Al registrar un gasto">
        <SettingRow title="Categoría"><div className="w-64"><Combobox value={d.cat || "auto"} onChange={(v) => set({ cat: v === "auto" ? "" : v })} options={[{ value: "auto", label: "Que se ponga sola", icon: "wand-sparkles" }, ...categoryOptions(cats)]} /></div></SettingRow>
        <SettingRow title="Medio de pago"><div className="w-64"><Combobox value={d.medio || "none"} onChange={(v) => set({ medio: v === "none" ? "" : v })} options={[{ value: "none", label: "Sin preferencia" }, ...methodOptions(medios)]} /></div></SettingRow>
        <SettingRow title="¿Quién gasta?"><div className="w-64"><Combobox value={d.quien || "familia"} onChange={(v) => set({ quien: v })} options={memberOptions(members)} /></div></SettingRow>
      </SettingSection>
      <SettingSection icon="hand-coins" title="Al registrar un préstamo">
        <SettingRow title="Sistema de cuotas" desc="Francés: cuota fija. Alemán: abono a capital fijo. Simple: interés sobre el capital inicial. Americano: solo intereses y el capital al final.">
          <div className="w-64"><Combobox value={d.sistema || "frances"} onChange={(v) => set({ sistema: v })} options={Object.entries(SISTEMAS).map(([value, x]) => ({ value, label: x.n, icon: x.icon, hint: x.t }))} /></div>
        </SettingRow>
        <SettingRow title="Frecuencia de pago"><div className="w-64"><Combobox value={d.frec || "mensual"} onChange={(v) => set({ frec: v })} options={Object.entries(FRECS).map(([value, f]) => ({ value, label: f.n }))} /></div></SettingRow>
        <SettingRow title="Número de cuotas"><NumBlur label="Número de cuotas" value={+(d.plazo ?? 12)} min={1} max={360} onSave={(v) => set({ plazo: v })} suffix="cuotas" /></SettingRow>
      </SettingSection>
    </div>
  )
}

/**
 * Nómina: el procedimiento de retención que usa tu empresa (los dos son de ley, arts. 385 y 386 del Estatuto
 * Tributario) y la tabla del Fondo de Solidaridad Pensional (por defecto la de la Ley 797 de 2003).
 */
function NominaSection({ value, onSave }: { value: NominaCfg; onSave: (v: NominaCfg) => void }) {
  const tabla = value.fsp?.length ? value.fsp : FSP_LEY797
  const propia = !!value.fsp?.length
  const setFila = (i: number, j: 0 | 1, n: number) => onSave({ ...value, fsp: tabla.map((f, k) => (k === i ? (j === 0 ? [n, f[1]] : [f[0], n]) : f)) as [number, number][] })
  return (
    <SettingSection icon="briefcase" title="Nómina (descuentos de empleados)" desc="Reglas nacionales que aplican a cualquier empresa. Se usan al calcular lo que te llega de un salario.">
      <SettingRow title="Retención en la fuente: procedimiento" desc={<>Los dos son de ley y tu empresa escoge uno. El <b>1</b> usa la tabla del art. 383 cada mes. En el <b>2</b> la empresa calcula un porcentaje fijo en junio y diciembre y lo pone en tu desprendible (p. ej. &quot;Procedimiento 2, 4,38 %&quot;). Si no sabes, deja el 1.</>}>
        <div className="flex flex-wrap items-center gap-2">
          <div className="w-64"><Combobox value={value.retModo ?? "auto"} onChange={(v) => onSave({ ...value, retModo: (v as NominaCfg["retModo"]) ?? "auto" })}
            options={[{ value: "auto", label: "Procedimiento 1 (tabla)" }, { value: "proc2", label: "Procedimiento 2 (% fijo)" }]} /></div>
          {value.retModo === "proc2" && <NumBlur label="Porcentaje del procedimiento 2" value={value.retPct ?? 0} min={0} max={39} step={0.01} onSave={(v) => onSave({ ...value, retPct: v })} suffix="%" />}
        </div>
      </SettingRow>
      <div className="grid gap-3 py-4">
        <div className="grid gap-0.5">
          <p className="font-medium">Fondo de Solidaridad Pensional</p>
          <p className="text-sm text-muted-foreground">Se descuenta si ganas 4 salarios mínimos o más. {propia ? "Estás usando una tabla propia." : "Hoy se usa la tabla de la Ley 797 de 2003."} Cámbiala solo si cambia la ley (por ejemplo, con la reforma pensional) o tu desprendible muestra otro porcentaje.</p>
        </div>
        <div className="grid gap-2">
          {tabla.map(([desde, pct], i) => (
            <div key={i} className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-muted-foreground">Desde</span>
              <NumBlur label={`Desde cuántos salarios mínimos, fila ${i + 1}`} value={desde} min={0} max={100} step={0.5} onSave={(v) => setFila(i, 0, v)} suffix="salarios mínimos:" />
              <NumBlur label={`Porcentaje, fila ${i + 1}`} value={pct} min={0} max={10} step={0.1} onSave={(v) => setFila(i, 1, v)} suffix="%" />
              <Button variant="ghost" size="icon" aria-label={`Quitar fila ${i + 1}`} onClick={() => onSave({ ...value, fsp: tabla.filter((_, k) => k !== i) })} disabled={tabla.length <= 1}><Trash2 /></Button>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={() => onSave({ ...value, fsp: [...tabla, [(tabla.at(-1)?.[0] ?? 3) + 1, tabla.at(-1)?.[1] ?? 1]] })}><Plus /> Agregar fila</Button>
          {propia && <Button variant="ghost" size="sm" onClick={() => onSave({ ...value, fsp: undefined })}><RotateCcw /> Volver a la tabla de ley</Button>}
        </div>
      </div>
    </SettingSection>
  )
}
