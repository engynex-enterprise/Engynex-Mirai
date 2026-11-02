"use client"

import { Plus, Trash2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Switch } from "@/components/ui/switch"
import { ChoiceCards, Segmented } from "@/components/mirai/choice-cards"
import { Combobox } from "@/components/mirai/combobox"
import { FormField, InfoTip } from "@/components/mirai/field"
import { Money } from "@/components/mirai/money"
import { MoneyInput } from "@/components/mirai/money-input"
import { ARLN, DTIPOS, dedCalc, type Deducciones } from "@/lib/domain"
import { fmtMoney, fmtPct } from "@/lib/format"

const PER = { quincenal: "por quincena", semanal: "por semana", anual: "al año", mensual: "al mes" } as Record<string, string>

/** Descuentos de nómina por defecto según el tipo de trabajador. */
export const defaultDed = (tipo: Deducciones["tipo"] = "empleado"): Deducciones => ({
  tipo, salud: true, pension: tipo !== "pensionado", fsp: true, ret: true, arl: tipo === "independiente", arlN: "1", ibcP: 40,
  retModo: tipo === "independiente" ? "pct" : "auto", retV: "", otros: [{ n: "", v: "" }, { n: "", v: "" }, { n: "", v: "" }],
})

function Toggle({ label, tip, checked, onChange, children }: { label: string; tip: string; checked: boolean; onChange: (v: boolean) => void; children?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border p-3">
      <Switch checked={checked} onCheckedChange={onChange} aria-label={label} />
      <span className="flex flex-1 items-center gap-1.5 text-sm font-medium">{label}<InfoTip text={tip} label={label} /></span>
      {checked && children}
    </div>
  )
}

/** Formulario de descuentos (dedForm de la v4) + vista previa en vivo del neto. */
export function DeductionsEditor({ value, onChange, bruto, frec, smmlv, uvt, resumen }: {
  value: Deducciones; onChange: (d: Deducciones) => void; bruto: number; frec: string; smmlv: number; uvt: number
  /** Reemplaza "Lo que te llega…" (p. ej. lo de cada quincena cuando los descuentos no van mitad y mitad). */
  resumen?: React.ReactNode
}) {
  const D = value
  const set = (p: Partial<Deducciones>) => onChange({ ...D, ...p })
  const t = D.tipo ?? "empleado"
  const r = dedCalc(bruto, frec, D, { smmlv, uvt })
  const otros = D.otros?.length ? D.otros : [{ n: "", v: "" }]
  const pctInput = (k: "saludP" | "pensionP", ph: string) => (
    <Input className="h-9 w-24" inputMode="decimal" placeholder={ph} aria-label="Porcentaje" value={String(D[k] ?? "")} onChange={(e) => set({ [k]: e.target.value.replace(",", ".") })} />
  )

  return (
    <div className="grid gap-5">
      <FormField label="¿Cómo trabajas?" tip={false}>
        <ChoiceCards value={t} cols={2} onChange={(v) => onChange({ ...defaultDed(v as Deducciones["tipo"]), otros: D.otros })}
          items={Object.entries(DTIPOS).map(([k, x]) => ({ value: k, label: x.l, desc: x.d, icon: x.icon }))} />
      </FormField>

      <div className="grid gap-2">
        {t !== "otro" && (
          <Toggle label="Salud" tip="Aporte obligatorio a tu EPS." checked={D.salud !== false} onChange={(v) => set({ salud: v })}>
            {pctInput("saludP", t === "independiente" ? "12,5 %" : t === "pensionado" ? "12 %" : "4 %")}
          </Toggle>
        )}
        {(t === "empleado" || t === "independiente") && (
          <>
            <Toggle label="Pensión" tip="Aporte obligatorio a tu fondo de pensiones." checked={D.pension !== false} onChange={(v) => set({ pension: v })}>
              {pctInput("pensionP", t === "independiente" ? "16 %" : "4 %")}
            </Toggle>
            <Toggle label="Fondo de solidaridad pensional" tip="Automático: solo si ganas 4 salarios mínimos o más." checked={D.fsp !== false} onChange={(v) => set({ fsp: v })} />
          </>
        )}
        {t === "independiente" && (
          <>
            <Toggle label="ARL (riesgos laborales)" tip="Seguro por accidentes de trabajo. El nivel depende de tu actividad." checked={D.arl !== false} onChange={(v) => set({ arl: v })}>
              <Combobox className="h-9 w-56" value={String(D.arlN ?? "1")} onChange={(v) => set({ arlN: v })} options={ARLN.map(([v, l, p]) => ({ value: v, label: `${l} · ${String(p).replace(".", ",")} %` }))} />
            </Toggle>
            <FormField label="Base de cotización (% de lo facturado)" tip="Los independientes cotizan sobre el 40 % de lo que facturan, mínimo un salario mínimo.">
              <Input className="h-11 w-32" inputMode="decimal" value={String(D.ibcP ?? 40)} onChange={(e) => set({ ibcP: e.target.value.replace(",", ".") })} />
            </FormField>
          </>
        )}
        {(t === "empleado" || t === "independiente") && (
          <Toggle label="Retención en la fuente" tip="Anticipo del impuesto de renta que te descuentan en cada pago." checked={D.ret !== false} onChange={(v) => set({ ret: v })}>
            <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
              <Segmented value={D.retModo ?? "auto"} onChange={(v) => set({ retModo: v as Deducciones["retModo"] })}
                items={[...(t === "empleado" ? [{ value: "auto", label: "Calcular aproximado" }] : []), { value: "pct", label: "Porcentaje" }, { value: "manual", label: "Valor fijo" }]} />
              {D.retModo === "pct" && <Input className="h-9 w-24" inputMode="decimal" placeholder="%" aria-label="Porcentaje de retención" value={String(D.retV ?? "")} onChange={(e) => set({ retV: e.target.value.replace(",", ".") })} />}
              {D.retModo === "manual" && <div className="w-40"><MoneyInput value={Number(D.retV) || 0} onChange={(v) => set({ retV: v })} /></div>}
            </div>
          </Toggle>
        )}
      </div>

      <FormField label="Otros descuentos" hint="Libranza, cooperativa, fondo de empleados, medicina prepagada, ahorro voluntario…">
        <div className="grid gap-2">
          {otros.map((o, i) => (
            <div key={i} className="grid grid-cols-[1fr_8.5rem_auto_auto] items-center gap-2">
              <Input className="h-10" placeholder="Ej. Libranza" aria-label={`Descuento ${i + 1}`} value={o.n ?? ""} onChange={(e) => set({ otros: otros.map((x, j) => (j === i ? { ...x, n: e.target.value } : x)) })} />
              {o.pct ? (
                <Input className="h-10" inputMode="decimal" placeholder="%" aria-label={`Porcentaje ${i + 1}`} value={String(o.v ?? "")} onChange={(e) => set({ otros: otros.map((x, j) => (j === i ? { ...x, v: e.target.value.replace(",", ".") } : x)) })} />
              ) : (
                <MoneyInput value={Number(o.v) || 0} onChange={(v) => set({ otros: otros.map((x, j) => (j === i ? { ...x, v } : x)) })} />
              )}
              <label className="flex items-center gap-1 text-xs text-muted-foreground"><Checkbox checked={!!o.pct} onCheckedChange={(c) => set({ otros: otros.map((x, j) => (j === i ? { ...x, pct: c === true, v: "" } : x)) })} />es %</label>
              <Button type="button" variant="ghost" size="icon" aria-label="Quitar descuento" onClick={() => set({ otros: otros.filter((_, j) => j !== i) })}><Trash2 /></Button>
            </div>
          ))}
          {otros.length < 8 && <Button type="button" variant="ghost" size="sm" className="w-fit" onClick={() => set({ otros: [...otros, { n: "", v: "" }] })}><Plus /> Agregar descuento</Button>}
        </div>
      </FormField>

      <div className="grid gap-3 rounded-lg border-l-4 border-lime bg-brand-soft p-4" aria-live="polite">
        {resumen ?? (<>
          <p className="text-sm">Lo que te llega a la cuenta {PER[frec] ?? "al mes"}</p>
          <Money value={r.neto} className="text-[22px] font-extrabold" />
        </>)}
        {bruto > 0 && (
          <table className="w-full text-sm">
            <tbody>
              <tr><td className="py-1">Valor bruto {PER[frec] ?? ""}</td><td className="py-1 text-right"><Money value={bruto} /></td></tr>
              {r.items.map((x) => (
                <tr key={x.n} className="border-t border-black/5 dark:border-white/10">
                  <td className="py-1">− {x.n} <span className="text-xs text-muted-foreground">({x.h})</span></td>
                  <td className="py-1 text-right text-danger"><Money value={x.v} /></td>
                </tr>
              ))}
              <tr className="border-t-2 font-semibold"><td className="py-1">Total descuentos ({fmtPct(bruto ? (r.total / bruto) * 100 : 0)})</td><td className="py-1 text-right"><Money value={r.total} /></td></tr>
            </tbody>
          </table>
        )}
        <p className="text-xs text-muted-foreground">Cálculo aproximado con salario mínimo {fmtMoney(smmlv)} y UVT {fmtMoney(uvt)}. Compáralo con tu desprendible de pago: si no coincide, ajusta los porcentajes o escribe la retención como valor fijo.</p>
      </div>
    </div>
  )
}
