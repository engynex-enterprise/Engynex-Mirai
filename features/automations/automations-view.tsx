"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useQueryClient } from "@tanstack/react-query"
import { Plus, Sparkles } from "lucide-react"
import { toast } from "@/components/mirai/toast"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Switch } from "@/components/ui/switch"
import { Input } from "@/components/ui/input"
import { DataTable, type DTColumn } from "@/components/mirai/data-table"
import { Kpi, KpiGrid } from "@/components/mirai/kpi"
import { Notice } from "@/components/mirai/notice"
import { PageHeader } from "@/components/mirai/page-header"
import { ResponsiveDialog } from "@/components/mirai/responsive-dialog"
import { StatusPill } from "@/components/mirai/status-pill"
import { Segmented } from "@/components/mirai/choice-cards"
import { useApp, useBookId, useCanEdit } from "@/components/app/app-context"
import { useSave, useSoftDelete } from "@/hooks/use-book-data"
import { qk } from "@/lib/supabase/tables"
import { canUseAi } from "@/lib/automations/limits"
import { CATALOG, summarize } from "@/lib/automations/catalog"
import { parseGraph, triggerOf, validateGraph } from "@/lib/automations/schema"
import { TEMPLATES } from "@/lib/automations/templates"
import { ensureDefaultAutomations } from "./actions"
import { ESTADOS, fechaHora, useActiveLimit, useAutomations, useRefs, useRuns, type Automation } from "./hooks"
import { FlowChips, RunsList, StepIcon, TemplateCard, useCreateAutomation } from "./shared"

/** Interruptor Activa/Pausada con el límite del plan y la validación del diagrama. */
export function useToggleActive(list: Automation[] | undefined) {
  const save = useSave("automations")
  const router = useRouter()
  const { limit, lleno } = useActiveLimit(list)
  return (a: Automation, on: boolean) => {
    if (on) {
      const v = validateGraph(parseGraph(a.grafo))
      if (!v.ok) { toast.error("Revisa la automatización antes de activarla", { description: v.issues[0]?.msg }); return }
      if (lleno) {
        toast.error(`Tu plan permite ${limit} automatizaciones activas`, { description: "Pausa otra o pásate a Premium para tenerlas sin límite.", action: { label: "Ver planes", onClick: () => router.push("/planes") } })
        return
      }
    }
    save.mutate({ id: a.id, activo: on } as never, { onSuccess: () => toast.success(on ? `“${a.nombre}” está activa` : `“${a.nombre}” quedó en pausa`) })
  }
}

export function useDuplicate() {
  const save = useSave("automations", { created: "Automatización duplicada (en pausa)" })
  return (a: Automation) => save.mutate({ nombre: `Copia de ${a.nombre}`.slice(0, 80), descripcion: a.descripcion, icon: a.icon, disparador: a.disparador, grafo: a.grafo, activo: false, plantilla: null } as never)
}

function NewDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (o: boolean) => void }) {
  const { plan } = useApp()
  const { create, pending } = useCreateAutomation()
  const [nombre, setNombre] = useState("")
  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange} wide title="Nueva automatización" description="Empieza con una plantilla (la puedes cambiar toda) o desde cero.">
      <div className="grid gap-5">
        <Card className="gap-3 p-4 shadow-none">
          <p className="font-semibold">Desde cero</p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input className="h-11" aria-label="Nombre de la automatización" placeholder="Ej. Avísame de los domicilios" maxLength={80} value={nombre} onChange={(e) => setNombre(e.target.value)} />
            <Button className="h-11" onClick={() => create(null, nombre.trim())} disabled={pending}><Plus /> Crear y abrir el editor</Button>
          </div>
        </Card>
        <div className="grid gap-3 md:grid-cols-2">
          {TEMPLATES.map((t) => <TemplateCard key={t.key} t={t} disabled={pending || (t.premium && !canUseAi(plan))} onUse={() => create(t)} />)}
        </div>
      </div>
    </ResponsiveDialog>
  )
}

/** Página del módulo: lista de automatizaciones, plantillas e historial. */
export function AutomationsView() {
  const can = useCanEdit()
  const bookId = useBookId()
  const { plan } = useApp()
  const qc = useQueryClient()
  const router = useRouter()
  const { data, isPending } = useAutomations()
  const { refs } = useRefs()
  const runs = useRuns(undefined, 20)
  const del = useSoftDelete("automations", "Automatización eliminada")
  const toggle = useToggleActive(data)
  const duplicate = useDuplicate()
  const { create, pending } = useCreateAutomation()
  const { limit, activas } = useActiveLimit(data)
  const [nuevo, setNuevo] = useState(false)
  const [tab, setTab] = useState("mias")
  const seeded = useRef(false)

  // La primera vez que se abre el módulo en este libro: deja creadas las automatizaciones por defecto.
  useEffect(() => {
    if (!can || seeded.current) return
    seeded.current = true
    ensureDefaultAutomations().then((r) => { if (r.creadas) qc.invalidateQueries({ queryKey: qk(bookId, "automations") }) })
  }, [can, bookId, qc])

  const names = useMemo(() => Object.fromEntries((data ?? []).map((a) => [a.id, a.nombre])), [data])
  const ejecuciones = (data ?? []).reduce((t, a) => t + (a.ejecuciones ?? 0), 0)
  const ultima = [...(data ?? [])].filter((a) => a.ultima_ejecucion).sort((a, b) => (a.ultima_ejecucion! < b.ultima_ejecucion! ? 1 : -1))[0]

  const columns: DTColumn<Automation>[] = [
    {
      id: "nombre", header: "Automatización", sort: (a) => a.nombre, csv: (a) => a.nombre,
      cell: (a) => {
        const g = parseGraph(a.grafo)
        const ok = validateGraph(g).ok
        return (
          <Link href={`/automatizaciones/${a.id}`} className="flex min-w-0 items-center gap-3 hover:underline">
            <StepIcon kind={triggerOf(g)?.kind ?? "gasto"} className="size-10 rounded-2xl" />
            <span className="grid min-w-0 gap-0.5">
              <span className="truncate font-semibold">{a.nombre}</span>
              <span className="flex flex-wrap items-center gap-1.5">
                <FlowChips graph={g} max={5} />
                {!ok && <StatusPill tone="warn">Revisar</StatusPill>}
              </span>
            </span>
          </Link>
        )
      },
    },
    {
      id: "disparador", header: "Cuándo corre", info: "El disparador: lo que pone a andar la automatización.", sort: (a) => a.disparador, csv: (a) => CATALOG[a.disparador as keyof typeof CATALOG]?.label ?? a.disparador,
      cell: (a) => { const t = triggerOf(parseGraph(a.grafo)); return <span className="text-sm">{t ? summarize(t, refs) : "Sin disparador"}</span> },
    },
    {
      id: "estado", header: "Estado", sort: (a) => (a.activo ? 1 : 0), csv: (a) => (a.activo ? "Activa" : "Pausada"),
      cell: (a) => (
        <label className="flex items-center gap-2">
          <Switch checked={a.activo} disabled={!can} onCheckedChange={(v) => toggle(a, v)} aria-label={`${a.activo ? "Pausar" : "Activar"} ${a.nombre}`} />
          <span className="text-sm font-medium">{a.activo ? "Activa" : "Pausada"}</span>
        </label>
      ),
    },
    {
      id: "ultima", header: "Última ejecución", sort: (a) => a.ultima_ejecucion ?? "", csv: (a) => a.ultima_ejecucion ?? "",
      cell: (a) => (
        <span className="grid gap-1 text-sm">
          <span>{fechaHora(a.ultima_ejecucion)}</span>
          {a.ultimo_estado && <StatusPill tone={ESTADOS[a.ultimo_estado]?.tone ?? "gray"} className="w-fit">{ESTADOS[a.ultimo_estado]?.label}</StatusPill>}
        </span>
      ),
    },
    { id: "ejecuciones", header: "Veces", align: "right", sort: (a) => a.ejecuciones, csv: (a) => a.ejecuciones, cell: (a) => <span className="font-semibold tabular-nums">{a.ejecuciones}</span> },
  ]

  return (
    <div className="grid gap-6">
      <PageHeader id="automatizaciones" title="Automatizaciones" description="Dile a Mirai qué hacer cuando pase algo con tu plata: avisarte, apartar para tus metas, ordenar tus gastos… y olvídate del resto."
        actions={can && <Button onClick={() => setNuevo(true)}><Plus /> Nueva automatización</Button>} />

      <KpiGrid className="xl:grid-cols-3">
        <Kpi icon="workflow" tone="green" label="Activas" value={limit === null ? activas : `${activas} de ${limit}`} sub={limit === null ? "Sin límite en tu plan" : "Plan Gratis"} loading={isPending} />
        <Kpi icon="zap" tone="blue" label="Veces que han corrido" value={ejecuciones.toLocaleString("es-CO")} sub={`${data?.length ?? 0} automatizaciones en este libro`} loading={isPending} />
        <Kpi icon="clock" tone="violet" label="Última ejecución" value={ultima ? fechaHora(ultima.ultima_ejecucion) : "Nunca"} sub={ultima?.nombre ?? "Aún no ha corrido ninguna"} loading={isPending} />
      </KpiGrid>

      {limit !== null && (
        <Notice tone="info" title={`Con el plan Gratis puedes tener ${limit} automatizaciones activas a la vez`}
          action={<Button size="sm" variant="soft" asChild><Link href="/planes"><Sparkles /> Ver Premium</Link></Button>}>
          Con Premium son ilimitadas y puedes pedirle consejos a la IA dentro de tus flujos.
        </Notice>
      )}

      <Segmented value={tab} onChange={setTab} items={[{ value: "mias", label: "Mis automatizaciones" }, { value: "plantillas", label: "Plantillas" }, { value: "historial", label: "Historial" }]} />

      {tab === "mias" && (
        <DataTable title="Tus automatizaciones" info="Toca una para abrir su diagrama. Usa el interruptor para activarla o pausarla." data={data} loading={isPending} columns={columns} rowKey={(a) => a.id}
          search={{ placeholder: "Buscar automatización", text: (a) => `${a.nombre} ${a.descripcion}` }}
          filters={[{ id: "estado", label: "Estado", options: [{ value: "on", label: "Activas" }, { value: "off", label: "Pausadas" }], match: (a, v) => (v === "on" ? a.activo : !a.activo) }]}
          create={can ? { label: "Nueva", onClick: () => setNuevo(true) } : undefined}
          exportName="automatizaciones"
          details={(a) => `/automatizaciones/${a.id}`}
          actions={can ? [
            { label: "Abrir el editor", onSelect: (a) => router.push(`/automatizaciones/${a.id}`) },
            { label: "Duplicar", onSelect: duplicate },
            { label: "Eliminar", destructive: true, onSelect: (a) => del.mutate(a) },
          ] : undefined}
          initialSort={{ id: "estado", dir: "desc" }}
        />
      )}

      {tab === "plantillas" && (
        <section className="grid gap-3" aria-label="Plantillas">
          <p className="text-muted-foreground">Toca <b>Usar</b> y se crea una copia en pausa que puedes cambiar a tu gusto.</p>
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {TEMPLATES.map((t) => <TemplateCard key={t.key} t={t} disabled={!can || pending || (t.premium && !canUseAi(plan))} onUse={() => create(t)} />)}
          </div>
        </section>
      )}

      {tab === "historial" && (
        <Card className="gap-3 p-4 shadow-card ring-0 sm:p-6">
          <h2 className="text-lg font-semibold">Últimas ejecuciones</h2>
          <RunsList runs={runs.data} loading={runs.isPending} names={names} />
        </Card>
      )}

      <NewDialog open={nuevo} onOpenChange={setNuevo} />
    </div>
  )
}
