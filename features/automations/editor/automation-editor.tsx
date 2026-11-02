"use client"

import "@xyflow/react/dist/style.css"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useTheme } from "next-themes"
import {
  Background, BackgroundVariant, Controls, MiniMap, Panel, ReactFlow, ReactFlowProvider, useReactFlow,
  type Connection, type EdgeChange, type NodeChange,
} from "@xyflow/react"
import { ArrowLeft, Copy, History, LayoutGrid, MoreHorizontal, Play, Plus, Redo2, Save, Trash2, Undo2 } from "lucide-react"
import { toast } from "@/components/mirai/toast"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { EmptyState } from "@/components/mirai/empty-state"
import { Notice } from "@/components/mirai/notice"
import { ResponsiveDialog } from "@/components/mirai/responsive-dialog"
import { SubmitButton } from "@/components/mirai/submit-button"
import { Segmented } from "@/components/mirai/choice-cards"
import { StatusPill } from "@/components/mirai/status-pill"
import { Crumbs } from "@/components/mirai/crumbs"
import { useApp, useCanEdit } from "@/components/app/app-context"
import { useSave, useSoftDelete } from "@/hooks/use-book-data"
import { useIsMobile } from "@/hooks/use-mobile"
import { CATALOG, summarize } from "@/lib/automations/catalog"
import { autoLayout, NODE_H, NODE_W } from "@/lib/automations/layout"
import { canUseAi } from "@/lib/automations/limits"
import { parseGraph, triggerHasMonto, triggerOf, validateGraph } from "@/lib/automations/schema"
import type { FlowNode, NodeData, NodeKind } from "@/lib/automations/types"
import { cn } from "@/lib/utils"
import type { TestResult } from "../actions"
import { useDuplicate, useToggleActive } from "../automations-view"
import { useActiveLimit, useAutomations, useRefs, useRuns, type Automation } from "../hooks"
import { RunsList, StepIcon } from "../shared"
import { connectProblem, edgeId, edgeView, makeNode, nodeView, readingOrder, stable, useGraphHistory, type RunMark, type StepNode } from "./graph"
import { DND_TYPE, Palette } from "./palette"
import { Properties } from "./properties"
import { StepNodeView } from "./step-node"
import { TestPanel } from "./test-panel"

const nodeTypes = { step: StepNodeView }
const MINI = { trigger: "#9EDB4E", condition: "#1F2B4B", action: "#3F7A1E" }

/** Página del editor: carga la automatización y monta el lienzo. */
export function AutomationEditor({ id }: { id: string }) {
  const { data, isPending } = useAutomations()
  const a = data?.find((x) => x.id === id)
  if (isPending) return <EditorSkeleton />
  if (!a)
    return (
      <Card className="shadow-card ring-0">
        <EmptyState iso="mirai" title="No encontramos esta automatización" description="Puede que la hayan eliminado o que sea de otro libro."
          action={<Button asChild><Link href="/automatizaciones"><ArrowLeft /> Volver a automatizaciones</Link></Button>} />
      </Card>
    )
  return (
    <ReactFlowProvider>
      <Editor key={a.id} a={a} list={data} />
    </ReactFlowProvider>
  )
}

export function EditorSkeleton() {
  return (
    <div className="grid gap-3">
      <Skeleton className="h-14 w-full rounded-2xl" />
      <div className="grid gap-3 md:grid-cols-[260px_1fr_320px]"><Skeleton className="hidden h-[560px] md:block" /><Skeleton className="h-[560px]" /><Skeleton className="hidden h-[560px] md:block" /></div>
    </div>
  )
}

type SidePanel = "revision" | "probar" | "historial"

function Editor({ a, list }: { a: Automation; list: Automation[] | undefined }) {
  const canEdit = useCanEdit()
  const { plan } = useApp()
  const mobile = useIsMobile()
  const router = useRouter()
  const { resolvedTheme } = useTheme()
  const rf = useReactFlow()
  const { refs, categorias, metas, miembros } = useRefs()
  const runs = useRuns(a.id, 30)
  const save = useSave("automations")
  const del = useSoftDelete("automations", "Automatización eliminada")
  const toggle = useToggleActive(list)
  const duplicate = useDuplicate()
  const { limit } = useActiveLimit(list)
  const aiLocked = !canUseAi(plan)

  const initial = useMemo(() => parseGraph(a.grafo), [a.grafo])
  const h = useGraphHistory(initial)
  const { graph, set, checkpoint } = h
  const [nombre, setNombre] = useState(a.nombre)
  const [saved, setSaved] = useState(() => stable(initial))
  const graphKey = stable(graph)
  const dirty = graphKey !== saved || nombre.trim() !== a.nombre
  const [selected, setSelected] = useState<string | null>(null)
  const [selectedEdge, setSelectedEdge] = useState<string | null>(null)
  // Medidas de cada tarjeta (React Flow las informa; se devuelven en los nodos controlados para que no se oculten).
  const [dims, setDims] = useState<Record<string, { width: number; height: number }>>({})
  const [panel, setPanel] = useState<SidePanel>("revision")
  const [tested, setTested] = useState<{ r: TestResult; key: string } | null>(null)
  const [mView, setMView] = useState<"lista" | "diagrama">("lista")
  const [mDialog, setMDialog] = useState<null | "agregar" | "paso" | "probar" | "historial">(null)
  const wrap = useRef<HTMLDivElement>(null)

  const validation = useMemo(() => validateGraph(graph), [graph])
  const trigger = triggerOf(graph)
  const selNode = graph.nodes.find((n) => n.id === selected) ?? null

  // Marcas de la última prueba (se borran al cambiar el diagrama).
  const test = tested?.r ?? null
  const marks = useMemo(() => {
    const m = new Map<string, RunMark>()
    const e = new Set<string>()
    if (!test?.ok || tested?.key !== graphKey) return { m, e }
    for (const s of test.steps) m.set(s.node, !s.ok ? "error" : s.wait ? "wait" : s.branch ?? "ok")
    for (const ed of graph.edges) {
      const src = m.get(ed.source)
      if (!src || !m.has(ed.target)) continue
      if (src === "si" || src === "no" ? ed.sourceHandle === src : !ed.sourceHandle) e.add(ed.id)
    }
    return { m, e }
  }, [test, tested?.key, graph.edges, graphKey])

  const nodes = useMemo(() => graph.nodes.map((n) => ({ ...nodeView(n, refs, validation.issues, selected, marks.m), measured: dims[n.id] })), [graph.nodes, refs, validation.issues, selected, marks, dims])
  const edges = useMemo(() => graph.edges.map((e) => ({ ...edgeView(e, marks.e), selected: e.id === selectedEdge })), [graph.edges, marks, selectedEdge])

  // ── Cambios desde el lienzo ──
  const onNodesChange = useCallback((changes: NodeChange<StepNode>[]) => {
    const dim = changes.filter((c) => c.type === "dimensions" && c.dimensions)
    if (dim.length) setDims((d) => { const n = { ...d }; for (const c of dim) if (c.type === "dimensions" && c.dimensions) n[c.id] = c.dimensions; return n })
    if (!canEdit) {
      for (const c of changes) if (c.type === "select") setSelected(c.selected ? c.id : null)
      return
    }
    const pos = changes.filter((c) => c.type === "position" && c.position)
    if (pos.length) set((g) => ({ ...g, nodes: g.nodes.map((n) => { const c = pos.find((p) => p.type === "position" && p.id === n.id); return c && c.type === "position" && c.position ? { ...n, position: c.position } : n }) }), false)
    const rm = changes.filter((c) => c.type === "remove").map((c) => (c.type === "remove" ? c.id : ""))
    if (rm.length) set((g) => ({ nodes: g.nodes.filter((n) => !rm.includes(n.id)), edges: g.edges.filter((e) => !rm.includes(e.source) && !rm.includes(e.target)) }))
    for (const c of changes) if (c.type === "select") { if (c.selected) { setSelected(c.id); setSelectedEdge(null) } else setSelected((s) => (s === c.id ? null : s)) }
  }, [canEdit, set])

  const onEdgesChange = useCallback((changes: EdgeChange[]) => {
    if (!canEdit) return
    const rm = changes.filter((c) => c.type === "remove").map((c) => (c.type === "remove" ? c.id : ""))
    if (rm.length) set((g) => ({ ...g, edges: g.edges.filter((e) => !rm.includes(e.id)) }))
    for (const c of changes) if (c.type === "select") { if (c.selected) { setSelectedEdge(c.id); setSelected(null) } else setSelectedEdge((s) => (s === c.id ? null : s)) }
  }, [canEdit, set])

  const onConnect = useCallback((c: Connection) => {
    const handle = (c.sourceHandle === "si" || c.sourceHandle === "no" ? c.sourceHandle : null) as "si" | "no" | null
    const problem = connectProblem(graph, c.source, c.target, handle)
    if (problem) { toast.error(problem); return }
    set((g) => ({ ...g, edges: [...g.edges, { id: edgeId(c.source, c.target, handle), source: c.source, target: c.target, sourceHandle: handle }] }))
  }, [graph, set])

  // ── Agregar pasos ──
  const replaceTrigger = useCallback((kind: NodeKind) => {
    set((g) => ({ ...g, nodes: g.nodes.map((n) => (n.type === "trigger" ? { ...n, kind, data: structuredClone(CATALOG[kind].defaults) } : n)) }))
    toast.success(`Disparador cambiado: ${CATALOG[kind].label}`)
  }, [set])

  /** Agrega un paso debajo del elegido (o del último) y lo conecta solo. */
  const addStep = useCallback((kind: NodeKind, at?: { x: number; y: number }) => {
    if (CATALOG[kind].group === "trigger" && trigger) { replaceTrigger(kind); return }
    const from = at ? null : (selNode ?? readingOrder(graph).at(-1) ?? null)
    const position = at ?? (from ? { x: from.position.x, y: from.position.y + NODE_H + 80 } : { x: -NODE_W / 2, y: 0 })
    const n = makeNode(kind, position)
    set((g) => {
      const edges = [...g.edges]
      if (from && CATALOG[kind].group !== "trigger") {
        let handle: "si" | "no" | null = null
        if (from.type === "condition") handle = g.edges.some((e) => e.source === from.id && e.sourceHandle === "si") ? "no" : "si"
        edges.push({ id: edgeId(from.id, n.id, handle), source: from.id, target: n.id, sourceHandle: handle })
      }
      return { nodes: [...g.nodes, n], edges }
    })
    setSelected(n.id)
    setSelectedEdge(null)
    setPanel("revision")
    if (!at && !mobile) setTimeout(() => rf.fitView({ padding: 0.25, duration: 300 }), 50)
  }, [graph, selNode, set, trigger, replaceTrigger, rf, mobile])

  const onDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    const kind = e.dataTransfer.getData(DND_TYPE) as NodeKind
    if (!kind || !CATALOG[kind] || !canEdit) return
    const p = rf.screenToFlowPosition({ x: e.clientX, y: e.clientY })
    addStep(kind, { x: p.x - NODE_W / 2, y: p.y - 30 })
  }, [rf, addStep, canEdit])

  const updateData = useCallback((nid: string, d: NodeData) => set((g) => {
    const cur = g.nodes.find((n) => n.id === nid)
    if (!cur || stable(cur.data) === stable(d)) return g
    return { ...g, nodes: g.nodes.map((n) => (n.id === nid ? { ...n, data: d } : n)) }
  }, false), [set])
  const removeNode = useCallback((nid: string) => {
    set((g) => ({ nodes: g.nodes.filter((n) => n.id !== nid), edges: g.edges.filter((e) => e.source !== nid && e.target !== nid) }))
    setSelected(null)
    setMDialog(null)
  }, [set])
  const duplicateNode = useCallback((n: FlowNode) => {
    const c = { ...makeNode(n.kind, { x: n.position.x + 40, y: n.position.y + 40 }), data: structuredClone(n.data) }
    set((g) => ({ ...g, nodes: [...g.nodes, c] }))
    setSelected(c.id)
  }, [set])

  const layout = useCallback(() => {
    set((g) => autoLayout(g))
    setTimeout(() => rf.fitView({ padding: 0.25, duration: 400 }), 60)
  }, [set, rf])

  // ── Guardar, activar, probar ──
  const doSave = useCallback(async (extra: Partial<Automation> = {}) => {
    const n = nombre.trim() || "Automatización sin nombre"
    const pausar = a.activo && !validation.ok && extra.activo === undefined
    await save.mutateAsync({ id: a.id, nombre: n.slice(0, 80), grafo: graph, disparador: trigger?.kind ?? a.disparador, ...(pausar ? { activo: false } : {}), ...extra } as never)
    setSaved(stable(graph))
    if (pausar) toast.warning("La pausamos porque tiene cosas por revisar", { description: validation.issues[0]?.msg })
    else toast.success("Cambios guardados")
  }, [a, graph, nombre, save, trigger, validation])

  const setActive = (on: boolean) => {
    if (dirty) {
      if (on && !validation.ok) { toast.error("Revisa la automatización antes de activarla", { description: validation.issues[0]?.msg }); return }
      if (on) { const others = (list ?? []).filter((x) => x.activo && x.id !== a.id).length; if (limit !== null && others >= limit) return toggle(a, on) }
      void doSave({ activo: on })
    } else toggle({ ...a, grafo: graph as never }, on)
  }

  const openTest = () => {
    setSelected(null)
    setPanel("probar")
    if (mobile) setMDialog("probar")
  }

  // Atajos: deshacer, rehacer y guardar.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey
      const typing = (e.target as HTMLElement)?.closest?.("input,textarea,[contenteditable=true]")
      if (mod && e.key.toLowerCase() === "s") { e.preventDefault(); if (canEdit && dirty) void doSave() }
      if (typing || !mod) return
      if (e.key.toLowerCase() === "z" && !e.shiftKey) { e.preventDefault(); h.undo() }
      if ((e.key.toLowerCase() === "z" && e.shiftKey) || e.key.toLowerCase() === "y") { e.preventDefault(); h.redo() }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [h, doSave, dirty, canEdit])

  // Aviso al salir con cambios sin guardar.
  useEffect(() => {
    if (!dirty) return
    const f = (e: BeforeUnloadEvent) => { e.preventDefault() }
    window.addEventListener("beforeunload", f)
    return () => window.removeEventListener("beforeunload", f)
  }, [dirty])

  const options = { categorias, metas, miembros, triggerHasMonto: triggerHasMonto(trigger) }
  const issuesOf = (nid: string) => validation.issues.filter((i) => i.nodeId === nid).map((i) => i.msg)
  const onTestResult = (r: TestResult | null) => setTested(r ? { r, key: graphKey } : null)

  const props = selNode && (
    <Properties key={selNode.id} node={selNode} options={options} issues={issuesOf(selNode.id)} readOnly={!canEdit}
      onChange={(d) => updateData(selNode.id, d)} onDelete={() => removeNode(selNode.id)} onDuplicate={() => duplicateNode(selNode)} />
  )
  // Punto de Deshacer al empezar a editar un paso.
  useEffect(() => { if (selected) checkpoint() }, [selected, checkpoint])

  const review = (
    <div className="grid content-start gap-4">
      {validation.ok
        ? <Notice tone="ok" title="Todo en orden">Prueba la automatización y actívala cuando quieras.</Notice>
        : (
          <div className="grid gap-2">
            <p className="font-semibold">Por revisar ({validation.issues.length})</p>
            <ul className="grid gap-1.5" data-testid="revision">
              {validation.issues.map((i, k) => (
                <li key={k}>
                  <button type="button" className="w-full rounded-lg bg-warning-soft p-2.5 text-left text-sm text-warning hover:brightness-95" onClick={() => { if (i.nodeId) { setSelected(i.nodeId); if (mobile) setMDialog("paso") } }}>
                    {i.nodeId && <b>{CATALOG[graph.nodes.find((n) => n.id === i.nodeId)?.kind ?? "gasto"]?.label}: </b>}{i.msg}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
      <div className="grid gap-1 text-sm text-muted-foreground">
        <p><b className="text-foreground">Cómo se lee:</b> de arriba hacia abajo. El disparador (lima) pone a andar el flujo, las condiciones (azul oscuro) eligen el camino Sí o No y las acciones (verde) hacen el trabajo.</p>
        <p>Toca un paso para editarlo. Para conectar, arrastra desde el punto de abajo de un paso hasta otro. Para borrar una conexión, tócala y presiona Suprimir.</p>
      </div>
    </div>
  )

  const addDialog = (
    <ResponsiveDialog open={mDialog === "agregar"} onOpenChange={(o) => setMDialog(o ? "agregar" : null)} title="Agregar paso" description={selNode ? `Se agrega después de “${CATALOG[selNode.kind].label}”.` : "Se agrega al final del flujo."}>
      <Palette hasTrigger={!!trigger} aiLocked={aiLocked} onAdd={(k) => { addStep(k); setMDialog(null) }} />
    </ResponsiveDialog>
  )

  const toolbar = (
    <div className="flex flex-wrap items-center gap-2 rounded-2xl border bg-card p-2 shadow-card">
      <Button variant="ghost" size="icon" asChild aria-label="Volver a automatizaciones"><Link href="/automatizaciones"><ArrowLeft /></Link></Button>
      <Input aria-label="Nombre de la automatización" value={nombre} maxLength={80} disabled={!canEdit} onChange={(e) => setNombre(e.target.value)} className="h-10 min-w-0 flex-1 basis-48 border-transparent bg-transparent text-[16px] font-semibold shadow-none hover:bg-hover focus-visible:bg-card" />
      <label className="flex items-center gap-2 rounded-full bg-secondary px-3 py-1.5">
        <Switch checked={a.activo} disabled={!canEdit} onCheckedChange={setActive} aria-label={a.activo ? "Pausar automatización" : "Activar automatización"} />
        <span className="text-sm font-semibold">{a.activo ? "Activa" : "Pausada"}</span>
      </label>
      <div className="flex flex-wrap items-center gap-1 max-md:w-full max-md:justify-between">
        {canEdit && <>
          <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon" onClick={h.undo} disabled={!h.canUndo} aria-label="Deshacer"><Undo2 /></Button></TooltipTrigger><TooltipContent>Deshacer (Ctrl+Z)</TooltipContent></Tooltip>
          <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon" onClick={h.redo} disabled={!h.canRedo} aria-label="Rehacer"><Redo2 /></Button></TooltipTrigger><TooltipContent>Rehacer (Ctrl+Shift+Z)</TooltipContent></Tooltip>
          <Tooltip><TooltipTrigger asChild><Button variant="ghost" size="icon" onClick={layout} aria-label="Ordenar el diagrama"><LayoutGrid /></Button></TooltipTrigger><TooltipContent>Ordenar el diagrama</TooltipContent></Tooltip>
        </>}
        {canEdit && !mobile && <Button variant="soft" className="lg:hidden" onClick={() => setMDialog("agregar")}><Plus /> Agregar paso</Button>}
        <Button variant="outline" onClick={openTest}><Play /> Probar</Button>
        {canEdit && <SubmitButton onClick={() => void doSave()} disabled={!dirty} loading={save.isPending} hint="No hay cambios por guardar" className="relative"><Save /> Guardar{dirty && <span className="absolute -top-1 -right-1 size-2.5 rounded-full bg-lime ring-2 ring-card" aria-hidden /> }{dirty && <span className="sr-only">(hay cambios sin guardar)</span>}</SubmitButton>}
        <DropdownMenu>
          <DropdownMenuTrigger asChild><Button variant="ghost" size="icon" aria-label="Más opciones"><MoreHorizontal /></Button></DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => (mobile ? setMDialog("historial") : (setSelected(null), setPanel("historial")))}><History /> Historial de ejecuciones</DropdownMenuItem>
            {canEdit && <DropdownMenuItem onSelect={() => duplicate({ ...a, nombre, grafo: graph as never })}><Copy /> Duplicar automatización</DropdownMenuItem>}
            {canEdit && <><DropdownMenuSeparator /><DropdownMenuItem variant="destructive" onSelect={() => { del.mutate(a); router.push("/automatizaciones") }}><Trash2 /> Eliminar</DropdownMenuItem></>}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  )

  const canvas = (interactive: boolean) => (
    <div ref={wrap} className="relative h-full min-h-0 overflow-hidden rounded-2xl border bg-[color-mix(in_oklch,var(--card),var(--background)_40%)]" onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move" }} onDrop={onDrop} data-testid="lienzo">
      <ReactFlow<StepNode>
        nodes={nodes} edges={edges} nodeTypes={nodeTypes}
        onNodesChange={onNodesChange} onEdgesChange={onEdgesChange} onConnect={onConnect}
        isValidConnection={(c) => !connectProblem(graph, c.source, c.target, (c.sourceHandle as "si" | "no" | null) ?? null)}
        onNodeDragStart={() => checkpoint()}
        onNodeClick={(_, n) => { if (mobile) { setSelected(n.id); setMDialog("paso") } }}
        onPaneClick={() => { setSelected(null); setSelectedEdge(null) }}
        nodesDraggable={interactive && canEdit} nodesConnectable={interactive && canEdit} elementsSelectable
        deleteKeyCode={interactive && canEdit ? ["Backspace", "Delete"] : null}
        snapToGrid snapGrid={[20, 20]} fitView fitViewOptions={{ padding: 0.25, maxZoom: 1 }} minZoom={0.25} maxZoom={1.75}
        colorMode={resolvedTheme === "dark" ? "dark" : "light"}
        defaultEdgeOptions={{ type: "smoothstep" }}
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1.4} />
        <Controls showInteractive={false} position="bottom-left" aria-label="Controles del lienzo" />
        {!mobile && <MiniMap pannable zoomable position="top-right" nodeBorderRadius={12} nodeColor={(n) => MINI[CATALOG[(n.data as StepNode["data"]).kind].group]} maskColor="rgba(31,43,75,.08)" />}
        {!graph.nodes.length && (
          <Panel position="top-center"><p className="rounded-full bg-card px-4 py-2 text-sm shadow-card">Arrastra un <b>disparador</b> desde la izquierda para empezar</p></Panel>
        )}
      </ReactFlow>
    </div>
  )

  // ── Celular: lista de pasos (edición simplificada) o diagrama de solo lectura ──
  if (mobile)
    return (
      <div className="grid min-w-0 gap-3">
        <Crumbs items={[{ label: "Inicio", href: "/inicio" }, { label: "Automatizaciones", href: "/automatizaciones" }]} />
        {toolbar}
        {!validation.ok && <Notice tone="warn" title={`Por revisar: ${validation.issues.length}`}>{validation.issues[0]?.msg}</Notice>}
        <Segmented value={mView} onChange={(v) => setMView(v as "lista" | "diagrama")} items={[{ value: "lista", label: "Pasos", icon: "list-checks" }, { value: "diagrama", label: "Diagrama", icon: "network" }]} />
        {mView === "diagrama" ? (
          <div className="h-[62dvh] min-h-[420px]">{canvas(false)}</div>
        ) : (
          <ol className="grid gap-2" data-testid="pasos">
            {readingOrder(graph).map((n) => {
              const outs = graph.edges.filter((e) => e.source === n.id)
              const iss = issuesOf(n.id)
              return (
                <li key={n.id}>
                  <button type="button" onClick={() => { setSelected(n.id); setMDialog("paso") }} className={cn("flex w-full items-start gap-3 rounded-2xl border bg-card p-3 text-left shadow-card", iss.length && "border-warning")} aria-label={`Editar paso: ${CATALOG[n.kind].label}`}>
                    <StepIcon kind={n.kind} className="size-10" />
                    <span className="grid min-w-0 flex-1 gap-0.5">
                      <span className="font-semibold">{CATALOG[n.kind].label}</span>
                      <span className="text-sm text-muted-foreground">{summarize(n, refs)}</span>
                      {outs.length > 0 && <span className="text-xs text-muted-foreground">Sigue con: {outs.map((e) => `${e.sourceHandle === "si" ? "Sí → " : e.sourceHandle === "no" ? "No → " : ""}${CATALOG[graph.nodes.find((x) => x.id === e.target)?.kind ?? "gasto"]?.label}`).join(" · ")}</span>}
                      {iss.length > 0 && <span className="text-xs font-medium text-warning">{iss[0]}</span>}
                    </span>
                  </button>
                </li>
              )
            })}
          </ol>
        )}
        {canEdit && <Button variant="soft" className="h-11" onClick={() => setMDialog("agregar")}><Plus /> Agregar paso</Button>}
        {canEdit && dirty && <SubmitButton className="h-11" onClick={() => void doSave()} loading={save.isPending}><Save /> Guardar cambios</SubmitButton>}

        {addDialog}
        <ResponsiveDialog open={mDialog === "paso" && !!selNode} onOpenChange={(o) => { if (!o) setMDialog(null) }} title={selNode ? CATALOG[selNode.kind].label : "Paso"}
          footer={<><Button variant="outline" onClick={() => setMDialog(null)}>Cerrar</Button>{canEdit && <SubmitButton onClick={() => { setMDialog(null); void doSave() }} disabled={!dirty} loading={save.isPending} hint="Cambia algo del paso para guardar" />}</>}>
          {props}
        </ResponsiveDialog>
        <ResponsiveDialog open={mDialog === "probar"} onOpenChange={(o) => setMDialog(o ? "probar" : null)} title="Probar la automatización">
          <TestPanel graph={graph} result={test} onResult={onTestResult} />
        </ResponsiveDialog>
        <ResponsiveDialog open={mDialog === "historial"} onOpenChange={(o) => setMDialog(o ? "historial" : null)} title="Historial de ejecuciones">
          <RunsList runs={runs.data} loading={runs.isPending} />
        </ResponsiveDialog>
      </div>
    )

  // ── Escritorio: paleta, lienzo y panel de propiedades ──
  return (
    <div className="grid min-w-0 gap-3">
      <Crumbs items={[{ label: "Inicio", href: "/inicio" }, { label: "Automatizaciones", href: "/automatizaciones" }]} />
      {toolbar}
      <div className="grid h-[calc(100dvh-210px)] min-h-[560px] grid-cols-[minmax(0,1fr)_300px] gap-3 lg:grid-cols-[250px_minmax(0,1fr)_330px]">
        <aside className="hidden min-h-0 overflow-y-auto rounded-2xl border bg-card p-3 shadow-card lg:block" aria-label="Pasos disponibles">
          {canEdit ? <Palette hasTrigger={!!trigger} aiLocked={aiLocked} onAdd={(k) => addStep(k)} /> : <p className="text-sm text-muted-foreground">Solo puedes ver esta automatización.</p>}
        </aside>
        {canvas(true)}
        <aside className="min-h-0 overflow-y-auto rounded-2xl border bg-card p-4 shadow-card" aria-label="Propiedades">
          {selNode ? props : selectedEdge && canEdit ? (
            <div className="grid gap-3">
              <p className="font-semibold">Conexión</p>
              <p className="text-sm text-muted-foreground">Une dos pasos. Si la quitas, el segundo paso queda suelto.</p>
              <Button variant="destructive" onClick={() => { set((g) => ({ ...g, edges: g.edges.filter((e) => e.id !== selectedEdge) })); setSelectedEdge(null) }}><Trash2 /> Quitar conexión</Button>
            </div>
          ) : (
            <div className="grid gap-4">
              <Segmented value={panel} onChange={(v) => setPanel(v as SidePanel)} items={[{ value: "revision", label: "Revisión", icon: "list-checks" }, { value: "probar", label: "Probar", icon: "play" }, { value: "historial", label: "Historial", icon: "history" }]} />
              {panel === "revision" && review}
              {panel === "probar" && <TestPanel graph={graph} result={test} onResult={onTestResult} />}
              {panel === "historial" && (
                <div className="grid gap-2">
                  <p className="text-sm text-muted-foreground">Corrió {a.ejecuciones} {a.ejecuciones === 1 ? "vez" : "veces"}.{a.ultimo_estado && <> Última: <StatusPill tone={a.ultimo_estado === "error" ? "bad" : "ok"}>{a.ultimo_estado === "error" ? "Con error" : "Bien"}</StatusPill></>}</p>
                  <RunsList runs={runs.data} loading={runs.isPending} />
                </div>
              )}
            </div>
          )}
        </aside>
      </div>
      <p className="sr-only" aria-live="polite">{dirty ? "Hay cambios sin guardar" : "Todo guardado"}</p>
      {addDialog}
    </div>
  )
}
