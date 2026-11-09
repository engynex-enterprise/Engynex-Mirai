"use client"

import { useState } from "react"
import Link from "next/link"
import { ArrowRight, Check, ChevronDown, CircleDashed, Pencil, Target } from "lucide-react"
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { FieldGroup } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Progress } from "@/components/ui/progress"
import { ChoiceCards } from "@/components/mirai/choice-cards"
import { Combobox } from "@/components/mirai/combobox"
import { DatePicker } from "@/components/mirai/date-picker"
import { FormField } from "@/components/mirai/field"
import { Icon } from "@/components/mirai/icon"
import { Money } from "@/components/mirai/money"
import { MoneyInput } from "@/components/mirai/money-input"
import { Panel } from "@/components/mirai/panel"
import { ResponsiveDialog } from "@/components/mirai/responsive-dialog"
import { StatusPill } from "@/components/mirai/status-pill"
import { SubmitButton } from "@/components/mirai/submit-button"
import { toast } from "@/components/mirai/toast"
import { useCanEdit } from "@/components/app/app-context"
import { useBookData } from "@/features/book/use-book-data"
import { useList, useSave } from "@/hooks/use-book-data"
import { useBookSettingsSave } from "@/features/settings/prefs"
import { METAS, metaDef, metaEstado, parseMetaCfg, type MetaCfg, type MetaTipo } from "@mirai/domain/meta"
import { todayISO } from "@/lib/format"
import type { Row } from "@/lib/supabase/tables"

const hoyMas = (meses: number) => { const d = new Date(); d.setMonth(d.getMonth() + meses); return d.toISOString().slice(0, 10) }

/**
 * Perfil › "Tu meta financiera": el norte del libro. Escoges qué quieres lograr (fondo, salir de deudas, casa, viaje…),
 * cuánto cuesta y para cuándo; Mirai la enlaza con una meta de Metas, te muestra el avance con tus propios datos y te
 * dice qué hacer ahora. Lo que escojas aquí también cambia lo que te recomienda el Consejero y el chat.
 */
export function MetaCard({ cfg }: { cfg: Row<"book_settings"> | undefined }) {
  const { data: book } = useBookData()
  const canEdit = useCanEdit()
  const [open, setOpen] = useState(false)
  const save = useBookSettingsSave()
  const meta = parseMetaCfg(cfg?.meta_cfg)
  const titulo = cfg?.meta ?? ""
  const est = book ? metaEstado(meta, titulo, book, todayISO()) : null

  const guardar = (patch: Partial<MetaCfg>, msg?: string) => {
    const next = { ...(meta ?? { tipo: "otro" as MetaTipo }), ...patch }
    save.mutate({ meta_cfg: next as never }, { onSuccess: () => msg && toast.success(msg) })
  }
  const marcar = (id: string, on: boolean) => guardar({ pasos: { ...(meta?.pasos ?? {}), [id]: on } })

  if (!est || !meta) return (
    <Panel id="meta" title="Tu meta principal" icon="target" className="h-auto"
      description="Lo más importante que quieres lograr con tu plata. Es una sola y manda sobre las demás: con ella Mirai te muestra el avance y te aconseja.">
      <div className="grid justify-items-center gap-3 rounded-xl bg-secondary/50 px-4 py-8 text-center">
        <span className="grid size-14 place-items-center rounded-full bg-card text-brand shadow-card"><Target className="size-7" /></span>
        <div className="grid gap-1">
          <p className="text-[15px] font-semibold">Todavía no has escogido tu meta</p>
          <p className="text-[14px] text-muted-foreground">Escoge una (por ejemplo, juntar $6.000.000 para la cuota inicial) y Mirai te dice cuánto guardar cada mes y cuánto llevas.</p>
        </div>
        <Button disabled={!canEdit} onClick={() => setOpen(true)}><Target /> Escoger mi meta</Button>
      </div>
      <MetaDialog open={open} onOpenChange={setOpen} meta={meta} titulo={titulo} />
    </Panel>
  )

  const pct = Math.round(est.progreso * 100)
  return (
    <Panel id="meta" title="Tu meta principal" icon="target" className="h-auto"
      action={canEdit ? <Button size="sm" variant="ghost" onClick={() => setOpen(true)}><Pencil /> Editar</Button> : undefined}>
      <div className="flex items-start gap-3">
        <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-brand-soft text-brand"><Icon name={est.def.icon} className="size-6" /></span>
        <div className="min-w-0 flex-1">
          <p className="text-[17px] leading-6 font-semibold">{est.titulo}</p>
          <p className="text-[13px] text-muted-foreground">{est.def.n}</p>
        </div>
        {est.lograda && <StatusPill tone="ok">¡Lograda!</StatusPill>}
      </div>

      {est.objetivo > 0 ? (
        <div className="grid gap-2">
          <Progress value={pct} className="h-2.5" aria-label={`Avance de tu meta: ${pct} %`} />
          <div className="flex flex-wrap items-baseline justify-between gap-2 text-[14px]">
            <span><b className="tabular-nums">{pct} %</b> · {est.def.tipo === "deudas" ? "ya pagaste" : "llevas"} <Money value={est.llevas} className="font-semibold" /></span>
            <span className="text-muted-foreground">{est.def.tipo === "deudas" ? "debías" : "de"} <Money value={est.objetivo} /></span>
          </div>
          {!est.lograda && est.mensual && <p className="text-[12px] text-muted-foreground">Lo que te falta repartido en los meses que quedan. Es un estimado.</p>}
          {!est.lograda && (
            <p className="text-[14px] text-muted-foreground">
              Te faltan <Money value={est.falta} className="font-semibold text-foreground" />
              {est.mensual ? <> · guarda <Money value={est.mensual} className="font-semibold text-foreground" /> al mes y llegas {est.meses === 1 ? "el otro mes" : `en ${est.meses} meses`}</> : " · ponle una fecha para saber cuánto guardar al mes"}
            </p>
          )}
        </div>
      ) : (
        <div className="grid gap-2 rounded-lg bg-secondary/60 p-3">
          <p className="text-[14px]">Ponle cuánto cuesta y para cuándo la quieres: ahí te decimos cuánto guardar al mes.</p>
          <Button size="sm" variant="outline" className="w-fit" disabled={!canEdit} onClick={() => setOpen(true)}>Ponerle monto y fecha</Button>
        </div>
      )}

      {est.siguiente && !est.lograda && (
        <p className="rounded-lg bg-brand-soft/60 p-3 text-[14px]"><b>Lo que sigue:</b> {est.siguiente.t}.</p>
      )}

      <Collapsible>
        <CollapsibleTrigger className="group flex w-full items-center gap-1.5 text-[13px] font-semibold text-link">
          <ChevronDown className="size-4 transition group-data-[state=open]:rotate-180" />
          Ver tus {est.pasos.length} pasos ({est.pasos.filter((p) => p.ok).length} listos)
        </CollapsibleTrigger>
        <CollapsibleContent className="pt-2">
          <p className="pb-1 text-[12px] text-muted-foreground">Los pasos con ✓ los marca Mirai sola con tus datos. Los de casilla los marcas tú cuando los hagas.</p>
          <ul className="grid gap-0.5">
            {est.pasos.map((p) => (
              <li key={p.id} className="flex items-start gap-2.5 rounded-lg px-1.5 py-1.5">
                {p.auto ? (
                  <span className={`mt-0.5 grid size-4 shrink-0 place-items-center rounded-full ${p.ok ? "bg-success text-white" : "text-muted-foreground"}`}>{p.ok ? <Check className="size-3" /> : <CircleDashed className="size-4" />}</span>
                ) : (
                  <Checkbox className="mt-0.5" checked={p.ok} disabled={!canEdit} onCheckedChange={(c) => marcar(p.id, c === true)} aria-label={p.t} />
                )}
                <div className="min-w-0">
                  <p className={`text-[14px] leading-5 ${p.ok ? "text-muted-foreground line-through" : ""}`}>{p.t}</p>
                  {p.d && !p.ok && <p className="text-[12px] leading-4 text-muted-foreground">{p.d}</p>}
                </div>
              </li>
            ))}
          </ul>
        </CollapsibleContent>
      </Collapsible>

      <div className="flex flex-wrap gap-2">
        {meta.goal_id ? <Button variant="outline" size="sm" asChild><Link href="/metas">Ver en Metas <ArrowRight /></Link></Button>
          : est.def.tipo === "fondo" ? <Button variant="outline" size="sm" asChild><Link href="/metas">Ver mi fondo <ArrowRight /></Link></Button>
          : est.def.tipo === "deudas" ? <Button variant="outline" size="sm" asChild><Link href="/estrategia">Ver mi plan de deudas <ArrowRight /></Link></Button>
          : null}
      </div>

      <MetaDialog open={open} onOpenChange={setOpen} meta={meta} titulo={titulo} />
    </Panel>
  )
}

/** Define o cambia la meta: tipo, nombre, monto, fecha y con qué meta de ahorro se cumple. */
function MetaDialog({ open, onOpenChange, meta, titulo }: { open: boolean; onOpenChange: (o: boolean) => void; meta: MetaCfg | null; titulo: string }) {
  const { data: book } = useBookData()
  const { data: goals = [] } = useList("goals")
  const saveCfg = useBookSettingsSave()
  const saveGoal = useSave("goals")
  const [tipo, setTipo] = useState<MetaTipo>(meta?.tipo ?? "fondo")
  const [nombre, setNombre] = useState(titulo)
  const [monto, setMonto] = useState(Number(meta?.monto ?? 0))
  const [fecha, setFecha] = useState<string | null>(meta?.fecha ?? hoyMas(12))
  const [goalId, setGoalId] = useState(meta?.goal_id ?? "")
  const [paso, setPaso] = useState<"tipo" | "detalle">(meta ? "detalle" : "tipo")
  const def = metaDef(tipo)
  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) { setTipo(meta?.tipo ?? "fondo"); setNombre(titulo); setMonto(Number(meta?.monto ?? 0)); setFecha(meta?.fecha ?? hoyMas(12)); setGoalId(meta?.goal_id ?? ""); setPaso(meta ? "detalle" : "tipo") }
  }

  const elegirTipo = (t: string) => {
    const d = metaDef(t as MetaTipo)
    setTipo(t as MetaTipo)
    if (!nombre.trim() || nombre === metaDef(tipo).titulo) setNombre(d.titulo)
    setPaso("detalle")
  }

  const guardar = async () => {
    let gid = goalId || null
    // "Crear una meta nueva": se crea en Metas con el monto y la fecha de aquí (así el avance se ve en los dos lados).
    if (def.ahorro && goalId === "nueva") {
      const row = await saveGoal.mutateAsync({ nombre: (nombre.trim() || def.titulo || "Mi meta"), objetivo: monto, ahorrado: 0, fecha, icon: def.icon } as never)
      gid = (row as { id?: string } | undefined)?.id ?? null
    }
    const cfg: MetaCfg = {
      tipo, monto: monto || null, fecha, goal_id: gid, pasos: meta?.pasos ?? {},
      creada: meta?.creada ?? todayISO(),
      // "Salir de deudas" se mide contra lo que debías el día que la definiste.
      base: tipo === "deudas" ? (meta?.tipo === "deudas" && meta.base ? meta.base : (book ? Number(book.liabilities.reduce((a, x) => a + Number(x.valor), 0)) || null : null)) : null,
    }
    saveCfg.mutate({ meta: nombre.trim().slice(0, 200), meta_cfg: cfg as never }, { onSuccess: () => { toast.success("Tu meta quedó lista"); onOpenChange(false) } })
  }

  const opcionesMeta = [
    { value: "", label: "Por ahora ninguno", icon: "circle-dashed" },
    { value: "nueva", label: "Crear un ahorro nuevo", icon: "plus" },
    ...goals.map((g) => ({ value: g.id, label: g.nombre, hint: `Meta: $${Number(g.objetivo).toLocaleString("es-CO")}`, icon: g.icon })),
  ]

  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange} wide title={meta ? "Cambia tu meta financiera" : "¿Cuál es tu meta?"}
      description={paso === "tipo" ? "Escoge lo que más te importa lograr ahora. Puedes cambiarla cuando quieras." : "Ponle nombre, cuánto cuesta y para cuándo la quieres."}
      onBack={paso === "detalle" ? () => setPaso("tipo") : undefined}
      footer={paso === "detalle"
        ? <><Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button>
          <SubmitButton loading={saveCfg.isPending || saveGoal.isPending} disabled={!nombre.trim()} onClick={guardar} hint="Escribe el nombre de tu meta">Guardar mi meta</SubmitButton></>
        : <><Button variant="outline" onClick={() => onOpenChange(false)}>Cancelar</Button><span className="self-center text-[13px] text-muted-foreground">Toca la que más te importe</span></>}>
      {paso === "tipo" ? (
        <ChoiceCards name="meta-tipo" cols={2} value={tipo} onChange={elegirTipo}
          items={METAS.map((m) => ({ value: m.tipo, label: m.n, desc: m.d, icon: m.icon }))} />
      ) : (
        <FieldGroup className="pb-2">
          <div className="flex items-center gap-3 rounded-xl bg-secondary/50 p-3">
            <span className="grid size-10 place-items-center rounded-lg bg-card text-brand shadow-card"><Icon name={def.icon} className="size-5" /></span>
            <div className="min-w-0 flex-1"><p className="text-[15px] font-semibold">{def.n}</p><p className="text-[13px] text-muted-foreground">{def.d}</p></div>
            <Button size="sm" variant="ghost" onClick={() => setPaso("tipo")}>Cambiar</Button>
          </div>
          <div className="grid gap-5 sm:grid-cols-2">
            <FormField label="¿Cómo la llamas?" htmlFor="mt-n" required tip="El nombre con el que la vas a reconocer, por ejemplo «Cuota inicial del apartamento»."><Input id="mt-n" className="h-11" maxLength={200} value={nombre} onChange={(e) => setNombre(e.target.value)} placeholder={def.titulo || "Ej. Comprar casa"} autoFocus /></FormField>
            <FormField label={def.tipo === "deudas" ? "¿Cuánto debes hoy?" : "¿Cuánto necesitas?"} htmlFor="mt-m" tip={def.tipo === "fondo" ? "Déjalo en cero y Mirai lo calcula por ti: tus gastos básicos de un mes por los meses que quieres aguantar." : "El monto completo de tu meta."}><MoneyInput id="mt-m" value={monto} onChange={setMonto} /></FormField>
            <FormField label="¿Para cuándo?" htmlFor="mt-f" tip="Con una fecha te decimos cuánto separar cada mes."><DatePicker id="mt-f" value={fecha} onChange={setFecha} quick="futuro" /></FormField>
            {def.ahorro && (
              <FormField label="¿Con cuál de tus ahorros la vas a cumplir?" htmlFor="mt-g" tip="Escoge un ahorro de la sección Metas. Así, cada vez que le abones plata, el avance de aquí sube solo.">
                <Combobox id="mt-g" value={goalId} onChange={setGoalId} options={opcionesMeta} />
              </FormField>
            )}
          </div>
          <p className="text-[13px] text-muted-foreground">
            {def.tipo === "fondo" ? "Tu avance sale de la plata que ya tienes guardada, comparada con lo que necesitas para aguantar los meses que te propusiste."
              : def.tipo === "deudas" ? "Tu avance se mide con lo que debes hoy frente a lo que debías cuando creaste la meta."
              : "Tu avance se mide con lo que lleves ahorrado en el ahorro que escojas."}
          </p>
        </FieldGroup>
      )}
    </ResponsiveDialog>
  )
}
