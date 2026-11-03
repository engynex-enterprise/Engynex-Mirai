"use client"

import { useMemo, useState } from "react"
import { ChevronDown, ImagePlus, Search, X } from "lucide-react"
import { toast } from "@/components/mirai/toast"
import { Button } from "@/components/ui/button"
import { FieldGroup } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { ResponsiveDialog } from "@/components/mirai/responsive-dialog"
import { FormField } from "@/components/mirai/field"
import { MoneyInput } from "@/components/mirai/money-input"
import { DatePicker } from "@/components/mirai/date-picker"
import { Combobox } from "@/components/mirai/combobox"
import { Segmented } from "@/components/mirai/choice-cards"
import { FormSkeleton } from "@/components/skeletons/form-skeleton"
import { SubmitButton } from "@/components/mirai/submit-button"
import { useSave } from "@/hooks/use-book-data"
import { fmtDate, todayISO } from "@/lib/format"
import { cn } from "@/lib/utils"
import type { Row } from "@/lib/supabase/tables"
import { CURRENCY_OPTIONS, categoryOptions, methodOptions, useCatalogsReady, useCategories, usePaymentMethods, useProviders } from "@/features/catalogs/hooks"
import { useAICategory } from "@/features/expenses/use-ai-category"
import { ProviderSelect } from "@/features/providers/provider-select"
import { categoriaSugerida, findProvider, norm } from "@/lib/domain"
import { SUBQ, SUBQ_GRUPOS, SubAvatar, toLogo } from "./sub-avatar"

type Props = { open: boolean; onOpenChange: (o: boolean) => void; sub?: Row<"subscriptions"> | null; preset?: { nombre: string; valor: number } | null }

export function SubscriptionForm(props: Props) {
  const ready = useCatalogsReady()
  return (
    <ResponsiveDialog open={props.open} onOpenChange={props.onOpenChange} title={props.sub ? "Editar suscripción" : "Nueva suscripción"}
      description="Streaming, música, apps, nube o gimnasio: todo lo que se cobra solo cada mes o cada año. Te avisamos antes de cada cobro para que decidas si la sigues pagando.">
      {ready ? <Body {...props} /> : <FormSkeleton />}
    </ResponsiveDialog>
  )
}

function Body({ onOpenChange, sub, preset }: Props) {
  const today = todayISO()
  const { data: methods = [] } = usePaymentMethods()
  const { data: cats = [] } = useCategories()
  const { data: providers = [] } = useProviders()
  const save = useSave("subscriptions")
  const plus15 = new Date(new Date(today + "T12:00:00").getTime() + 15 * 864e5).toISOString().slice(0, 10)
  const [nombre, setNombre] = useState(sub?.nombre ?? preset?.nombre ?? "")
  const [valor, setValor] = useState(Number(sub?.valor ?? preset?.valor ?? 0))
  const [currency, setCurrency] = useState(sub?.currency ?? "COP")
  const [ciclo, setCiclo] = useState(sub?.ciclo ?? "mensual")
  const [proximo, setProximo] = useState(sub?.proximo ?? plus15)
  const [medio, setMedio] = useState<string | null>(sub?.payment_method_id ?? methods.find((m) => /cr[eé]dito/i.test(m.nombre))?.id ?? methods[0]?.id ?? null)
  const [comparte, setComparte] = useState(String(sub?.comparte ?? 1))
  const [logo, setLogo] = useState<string | null>(sub?.logo_path ?? null)
  const [prov, setProv] = useState<string | null>(sub?.provider_id ?? null)
  const [catId, setCatId] = useState<string | null>(sub?.category_id ?? cats.find((c) => c.nombre === "Suscripciones")?.id ?? null)
  const [catManual, setCatManual] = useState(!!sub)
  const ai = useAICategory({ manual: catManual, onCategory: setCatId })
  const valido = !!nombre.trim() && valor > 0
  const pickName = (n: string) => { setNombre(n); ai.ask(n, valor) }

  const submit = async () => {
    if (!valido) return
    await save.mutateAsync({
      ...(sub ? { id: sub.id } : {}), nombre: nombre.trim(), valor, currency, ciclo, proximo, payment_method_id: medio, comparte: Number(comparte),
      logo_path: logo, category_id: catId ?? cats.find((c) => c.nombre === "Suscripciones")?.id ?? null,
      // Si no eligió proveedor pero ya tiene uno con el mismo nombre (Netflix, Claro…), queda enlazado.
      provider_id: prov ?? findProvider(providers, nombre)?.id ?? null,
    } as never)
    toast.success(`${nombre.trim()} guardada`, { description: `Te avisaremos antes del cobro del ${fmtDate(proximo)}.` })
    onOpenChange(false)
  }

  return (
    <FieldGroup className="pb-2">
      {!sub && <QuickServices value={nombre} onPick={(n) => { pickName(n); document.getElementById("s-valor")?.focus() }} />}
      <div className="grid gap-5 sm:grid-cols-2">
        <FormField label="Servicio" htmlFor="s-nombre" required>
          <div className="flex items-center gap-2">
            <SubAvatar nombre={nombre || "?"} logo={logo} size={44} />
            <Input id="s-nombre" className="h-11" value={nombre} onChange={(e) => pickName(e.target.value)} placeholder="Ej. Netflix" />
          </div>
        </FormField>
        <FormField label="Valor" htmlFor="s-valor" required><MoneyInput id="s-valor" value={valor} onChange={setValor} currency={currency} decimals /></FormField>
        <FormField label="Moneda" htmlFor="s-moneda"><Combobox id="s-moneda" value={currency} onChange={setCurrency} options={CURRENCY_OPTIONS} /></FormField>
        <FormField label="¿Cada cuánto?"><Segmented value={ciclo} onChange={setCiclo} items={[{ value: "mensual", label: "Mensual" }, { value: "anual", label: "Anual" }]} /></FormField>
        <FormField label="Próximo cobro" htmlFor="s-prox"><DatePicker id="s-prox" value={proximo} onChange={(v) => setProximo(v ?? plus15)} quick="futuro" /></FormField>
        <FormField label="¿Con qué se paga?" htmlFor="s-medio"><Combobox id="s-medio" value={medio} onChange={setMedio} options={methodOptions(methods)} /></FormField>
        <FormField label="¿La compartes?" tip="Si la pagan entre varias personas, contamos solo tu parte en tu presupuesto.">
          <Segmented value={comparte} onChange={setComparte} items={[{ value: "1", label: "No" }, ...[2, 3, 4, 5].map((n) => ({ value: String(n), label: `Entre ${n}` }))]} />
        </FormField>
        <FormField label="Proveedor (opcional)" htmlFor="s-prov" tip="La empresa que te cobra. Si te lo cobra otra (por ejemplo, Netflix incluido en tu plan de Claro), elígela aquí para ver en Proveedores cuánto le pagas.">
          <ProviderSelect id="s-prov" value={prov} placeholder="El mismo servicio" onChange={(id, p) => { setProv(id); const c = categoriaSugerida(p, cats); if (c && !sub && !catManual) setCatId(c); if (!sub && p?.payment_method_id) setMedio(p.payment_method_id) }} />
        </FormField>
        <FormField label="Categoría" htmlFor="s-cat" hint={ai.hint}>
          <Combobox id="s-cat" value={catId} onChange={(v) => { setCatManual(true); setCatId(v) }} options={categoryOptions(cats)} />
        </FormField>
        <FormField label="Logo (opcional)" tip="Los servicios conocidos ya traen su logo. Si quieres otra imagen, súbela aquí.">
          <label className="flex h-11 cursor-pointer items-center gap-2 rounded-lg border border-dashed px-3 text-sm text-muted-foreground hover:bg-hover">
            <ImagePlus className="size-4" /> {logo ? "Cambiar imagen" : "Subir imagen"}
            <input type="file" accept="image/*" className="sr-only" onChange={async (e) => { const f = e.target.files?.[0]; if (f) setLogo(await toLogo(f)) }} />
          </label>
        </FormField>
      </div>
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
        <SubmitButton disabled={!valido} loading={save.isPending} onClick={submit} />
      </div>
    </FieldGroup>
  )
}

// Al abrir se ven los más populares; el resto, agrupados y con buscador, en "Ver más servicios".
const POPULARES = [...SUBQ.filter(([, , g]) => g === SUBQ_GRUPOS[0]).slice(0, 8), ...SUBQ.filter(([, , g]) => g === SUBQ_GRUPOS[1]).slice(0, 4)].map(([n]) => n)

/** Accesos rápidos de servicios comunes: populares, y con "Ver más servicios" un buscador y pestañas por grupo. */
function QuickServices({ value, onPick }: { value: string; onPick: (n: string) => void }) {
  const [more, setMore] = useState(false)
  const [q, setQ] = useState("")
  const [grupo, setGrupo] = useState<string | null>(null)
  const list = useMemo(() => {
    if (!more) return POPULARES
    const n = norm(q.trim())
    return SUBQ.filter(([s, , g]) => (!grupo || g === grupo) && (!n || norm(s).includes(n) || norm(g).includes(n))).map(([s]) => s)
  }, [more, q, grupo])
  const chip = (on: boolean) => cn("inline-flex h-8 shrink-0 items-center rounded-full px-3 text-[13px] font-semibold transition-colors", on ? "bg-brand-soft text-link" : "bg-secondary text-muted-foreground hover:text-foreground")
  return (
    <div className="grid min-w-0 gap-3">
      {more && (
        <>
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input className="h-10 pl-9" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar un servicio (Netflix, AWS, Platzi…)" aria-label="Buscar un servicio" />
            {q && <button type="button" aria-label="Borrar búsqueda" className="absolute top-1/2 right-2 grid size-6 -translate-y-1/2 place-items-center rounded-full hover:bg-hover" onClick={() => setQ("")}><X className="size-3.5" /></button>}
          </div>
          <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Tipos de servicio">
            <button type="button" role="tab" aria-selected={!grupo} className={chip(!grupo)} onClick={() => setGrupo(null)}>Todos</button>
            {SUBQ_GRUPOS.map((g) => <button key={g} type="button" role="tab" aria-selected={grupo === g} className={chip(grupo === g)} onClick={() => setGrupo(grupo === g ? null : g)}>{g}</button>)}
          </div>
        </>
      )}
      <div className="flex max-h-56 flex-wrap gap-2 overflow-y-auto" role="group" aria-label="Servicios comunes">
        {list.map((n) => (
          <button key={n} type="button" onClick={() => onPick(n)}
            className={cn("flex max-w-full items-center gap-2 rounded-full border py-1 pr-3 pl-1 text-sm hover:bg-hover", value === n && "border-brand bg-brand-soft")}>
            <SubAvatar nombre={n} size={24} /><span className="truncate">{n}</span>
          </button>
        ))}
        {!list.length && <p className="text-sm text-muted-foreground">No está en la lista: escríbelo abajo en “Servicio”.</p>}
      </div>
      <Button type="button" variant="link" size="sm" className="w-fit px-0" onClick={() => { setMore(!more); setQ(""); setGrupo(null) }}>
        <ChevronDown className={cn("transition", more && "rotate-180")} />{more ? "Ver solo los populares" : `Ver más servicios (${SUBQ.length})`}
      </Button>
    </div>
  )
}
