"use client"

import { useMemo, useRef, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { Archive, ArchiveRestore, ArrowLeft, CheckSquare, Copy, Download, FileText, Info, Link2, ListChecks, MessageSquarePlus, MoreHorizontal, Pencil, Pin, PinOff, Search, Share2, SlidersHorizontal, Sparkles, Trash2, X } from "lucide-react"
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuSub, ContextMenuSubContent, ContextMenuSubTrigger, ContextMenuTrigger } from "@/components/ui/context-menu"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem, DropdownMenuSeparator, DropdownMenuSub, DropdownMenuSubContent, DropdownMenuSubTrigger, DropdownMenuTrigger } from "@/components/ui/dropdown-menu"
import { Skeleton } from "@/components/ui/skeleton"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { IsoIcon } from "@/components/mirai/iso-icon"
import { groupThreads, matchThread } from "@/lib/chat/history"
import type { ChatThread, Tono } from "@/lib/chat/types"
import { cn } from "@/lib/utils"
import { chatThreadInfo } from "./api"
import { useThreadActions, useThreads, useThreadSearch } from "./hooks"
import { useChat } from "./store"

// Historial de conversaciones (estilo ChatGPT/Gemini): buscar en títulos y contenido, agrupadas por fecha (fijadas
// arriba, luego por última actividad), menú ⋯ y clic derecho con fijar, renombrar en línea, título con IA, duplicar,
// archivar, exportar (texto, Markdown, PDF), copiar enlace, detalles y eliminar (con confirmación y Deshacer).
// Teclado: ↑/↓ para moverte, Enter para abrir, tecla de menú o Shift+F10 para el menú contextual.

const when = (iso: string) => { try { return new Date(iso).toLocaleString("es-CO", { dateStyle: "medium", timeStyle: "short" }) } catch { return "" } }

type Kit = {
  Item: typeof DropdownMenuItem | typeof ContextMenuItem; Sep: typeof DropdownMenuSeparator | typeof ContextMenuSeparator
  Sub: typeof DropdownMenuSub | typeof ContextMenuSub; SubTrigger: typeof DropdownMenuSubTrigger | typeof ContextMenuSubTrigger; SubContent: typeof DropdownMenuSubContent | typeof ContextMenuSubContent
}
const DROP: Kit = { Item: DropdownMenuItem, Sep: DropdownMenuSeparator, Sub: DropdownMenuSub, SubTrigger: DropdownMenuSubTrigger, SubContent: DropdownMenuSubContent }
const CTX: Kit = { Item: ContextMenuItem, Sep: ContextMenuSeparator, Sub: ContextMenuSub, SubTrigger: ContextMenuSubTrigger, SubContent: ContextMenuSubContent }

type On = { rename: () => void; info: () => void; del: () => void; select?: () => void }

/** Opciones de una conversación (las mismas en el menú ⋯, el clic derecho y el encabezado). */
function MenuEntries({ kit: K, t, on }: { kit: Kit; t: ChatThread; on: On }) {
  const a = useThreadActions()
  const later = (f: () => void) => () => setTimeout(f, 0) // después de que el menú devuelve el foco
  return (
    <>
      <K.Item onSelect={() => a.pin(t)}>{t.fijado ? <PinOff /> : <Pin />} {t.fijado ? "Desfijar" : "Fijar arriba"}</K.Item>
      <K.Item onSelect={later(on.rename)}><Pencil /> Renombrar</K.Item>
      <K.Item onSelect={() => a.retitle(t)}><Sparkles /> Generar título</K.Item>
      <K.Item onSelect={() => a.duplicate(t)}><Copy /> Duplicar</K.Item>
      <K.Item onSelect={() => a.archive([t], !t.archivado)}>{t.archivado ? <ArchiveRestore /> : <Archive />} {t.archivado ? "Desarchivar" : "Archivar"}</K.Item>
      <K.Sub>
        <K.SubTrigger><Share2 /> Compartir o exportar</K.SubTrigger>
        <K.SubContent className="w-56">
          <K.Item onSelect={() => a.copyText(t)}><Copy /> Copiar como texto</K.Item>
          <K.Item onSelect={() => a.markdown(t)}><FileText /> Descargar en Markdown</K.Item>
          <K.Item onSelect={() => a.pdf(t)}><Download /> Descargar en PDF</K.Item>
        </K.SubContent>
      </K.Sub>
      <K.Item onSelect={() => a.copyLink(t)}><Link2 /> Copiar enlace</K.Item>
      <K.Item onSelect={later(on.info)}><Info /> Detalles</K.Item>
      {on.select && <K.Item onSelect={on.select}><ListChecks /> Seleccionar varias</K.Item>}
      <K.Sep />
      <K.Item variant="destructive" onSelect={later(on.del)}><Trash2 /> Eliminar</K.Item>
    </>
  )
}

/** Confirmar eliminación y ventana de detalles (compartidas por la lista y el encabezado). */
export function useThreadDialogs() {
  const { remove } = useThreadActions()
  const [del, setDel] = useState<ChatThread[] | null>(null)
  const [info, setInfo] = useState<ChatThread | null>(null)
  const q = useQuery({ queryKey: ["chat-info", info?.id], enabled: !!info, queryFn: () => chatThreadInfo(info!.id) })
  const node = (
    <>
      <AlertDialog open={!!del} onOpenChange={(o) => !o && setDel(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{del && del.length > 1 ? `¿Eliminar ${del.length} conversaciones?` : "¿Eliminar esta conversación?"}</AlertDialogTitle>
            <AlertDialogDescription>{del?.length === 1 ? `“${del[0].titulo}” se quitará de tu historial.` : "Se quitarán de tu historial."} Podrás deshacerlo justo después.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={() => { if (del) remove(del); setDel(null) }}>Eliminar</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <Dialog open={!!info} onOpenChange={(o) => !o && setInfo(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader><DialogTitle className="pr-6">{info?.titulo}</DialogTitle><DialogDescription>Detalles de la conversación</DialogDescription></DialogHeader>
          {info && (
            <dl className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-2 text-[14px]">
              <dt className="text-muted-foreground">Creada</dt><dd>{when(info.created_at)}</dd>
              <dt className="text-muted-foreground">Última actividad</dt><dd>{when(info.updated_at)}</dd>
              <dt className="text-muted-foreground">Mensajes</dt><dd>{q.data ? `${q.data.mensajes} (${q.data.preguntas} preguntas tuyas)` : <Skeleton className="h-4 w-24" />}</dd>
              <dt className="text-muted-foreground">Créditos de IA</dt><dd>{q.data ? `${q.data.creditos.toLocaleString("es-CO")}${q.data.algoritmo ? ` · ${q.data.algoritmo} respuestas sin IA` : ""}` : <Skeleton className="h-4 w-20" />}</dd>
              <dt className="text-muted-foreground">Estado</dt><dd>{[info.fijado && "Fijada", info.archivado && "Archivada"].filter(Boolean).join(" · ") || "Activa"}</dd>
              {info.ultimo && <><dt className="text-muted-foreground">Último mensaje</dt><dd className="line-clamp-3">{info.ultimo}</dd></>}
            </dl>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
  return { askDelete: (ts: ChatThread[]) => setDel(ts), showInfo: setInfo, node }
}

function RenameInput({ t, onDone }: { t: ChatThread; onDone: () => void }) {
  const { rename } = useThreadActions()
  const [v, setV] = useState(t.titulo)
  const done = useRef(false)
  const finish = (save: boolean) => { if (done.current) return; done.current = true; if (save) rename(t, v); onDone() }
  return (
    <input autoFocus value={v} aria-label="Nuevo nombre de la conversación" maxLength={80} onFocus={(e) => e.currentTarget.select()}
      className="h-9 w-full min-w-0 rounded-lg bg-card px-2.5 text-[14px] ring-2 ring-brand outline-none"
      onChange={(e) => setV(e.target.value)} onBlur={() => finish(true)}
      onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); finish(true) } if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); finish(false) } }} />
  )
}

function Row({ t, active, onOpen, selecting, selected, onToggle, dialogs, onSelectMode }: {
  t: ChatThread; active: boolean; onOpen: () => void; selecting: boolean; selected: boolean; onToggle: () => void
  dialogs: ReturnType<typeof useThreadDialogs>; onSelectMode: () => void
}) {
  const [edit, setEdit] = useState(false)
  if (edit) return <div className="px-1 py-0.5"><RenameInput t={t} onDone={() => setEdit(false)} /></div>
  const on: On = { rename: () => setEdit(true), info: () => dialogs.showInfo(t), del: () => dialogs.askDelete([t]), select: onSelectMode }
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div className={cn("group/row relative flex items-center rounded-lg transition-colors hover:bg-hover", active && "bg-brand-soft hover:bg-brand-soft", selected && "bg-brand-soft/70")}>
          {active && <span aria-hidden className="absolute top-1.5 bottom-1.5 left-0 w-[3px] rounded-full bg-brand" />}
          {selecting && <Checkbox checked={selected} onCheckedChange={onToggle} aria-label={`Seleccionar ${t.titulo}`} className="ml-2" />}
          <Tooltip delayDuration={800}>
            <TooltipTrigger asChild>
              <button type="button" data-thread-row onClick={selecting ? onToggle : onOpen} aria-current={active ? "true" : undefined}
                className="flex min-w-0 flex-1 items-center gap-2 rounded-lg py-2 pr-1 pl-2.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring">
                {t.fijado && <Pin className="size-3 shrink-0 text-muted-foreground" aria-hidden />}
                <span className={cn("truncate text-[14px]", active && "font-semibold text-link")}>{t.titulo}</span>
              </button>
            </TooltipTrigger>
            <TooltipContent side="right" className="max-w-64 text-[12px]">
              <p className="font-semibold">{t.titulo}</p>
              <p className="opacity-80">Creada {when(t.created_at)} · Última actividad {when(t.updated_at)}</p>
              {t.ultimo && <p className="mt-1 line-clamp-2 opacity-90">{t.ultimo}</p>}
            </TooltipContent>
          </Tooltip>
          {!selecting && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button type="button" aria-label={`Opciones de ${t.titulo}`} className="mr-1 grid size-7 shrink-0 place-items-center rounded-md text-muted-foreground opacity-100 hover:bg-secondary hover:text-foreground focus-visible:opacity-100 data-[state=open]:opacity-100 md:opacity-0 md:group-focus-within/row:opacity-100 md:group-hover/row:opacity-100">
                  <MoreHorizontal className="size-4" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56"><MenuEntries kit={DROP} t={t} on={on} /></DropdownMenuContent>
            </DropdownMenu>
          )}
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-56"><MenuEntries kit={CTX} t={t} on={on} /></ContextMenuContent>
    </ContextMenu>
  )
}

/** Historial de conversaciones. `searchRef` permite enfocar la búsqueda con Ctrl/⌘ + K en /consejero. */
export function ThreadList({ onPick, className, showNew = true }: { onPick?: () => void; className?: string; showNew?: boolean }) {
  const { data, isPending } = useThreads()
  const { archive } = useThreadActions()
  const threadId = useChat((s) => s.threadId)
  const setThread = useChat((s) => s.setThread)
  const dialogs = useThreadDialogs()
  const [q, setQ] = useState("")
  const [view, setView] = useState<"todas" | "archivadas">("todas")
  const [sel, setSel] = useState<Set<string> | null>(null)
  const extra = useThreadSearch(q)
  const arch = view === "archivadas"
  const visible = useMemo(() => (data ?? []).filter((t) => !!t.archivado === arch && matchThread(t, q, extra.data, t.id)), [data, q, extra.data, arch])
  const groups = useMemo(() => (arch ? (visible.length ? [{ key: "antes" as const, label: "Archivadas", items: visible }] : []) : groupThreads(visible, new Date())), [visible, arch])
  const nArch = (data ?? []).filter((t) => t.archivado).length
  const picked = visible.filter((t) => sel?.has(t.id))
  const toggle = (id: string) => setSel((s) => { const n = new Set(s ?? []); if (n.has(id)) n.delete(id); else n.add(id); return n })
  const nav = useRef<HTMLElement>(null)
  // ↑/↓ entre conversaciones, Inicio/Fin para ir a los extremos.
  const onKey = (e: React.KeyboardEvent) => {
    const rows = [...(nav.current?.querySelectorAll<HTMLButtonElement>("[data-thread-row]") ?? [])]
    const i = rows.indexOf(document.activeElement as HTMLButtonElement)
    if (i < 0) return
    const go = e.key === "ArrowDown" ? i + 1 : e.key === "ArrowUp" ? i - 1 : e.key === "Home" ? 0 : e.key === "End" ? rows.length - 1 : null
    if (go === null) return
    e.preventDefault()
    rows[Math.max(0, Math.min(rows.length - 1, go))]?.focus()
  }
  return (
    <div className={cn("flex min-h-0 flex-col", className)}>
      <div className="grid gap-2 p-3 pb-2">
        {showNew && !arch && (
          <button type="button" onClick={() => { setThread(null); useChat.getState().setDraft(""); onPick?.() }}
            className="press flex h-10 items-center gap-2 rounded-xl bg-card px-3 text-[14px] font-semibold shadow-[0_1px_2px_rgba(0,0,0,.08)] ring-1 ring-black/5 transition-colors hover:bg-hover dark:ring-white/10">
            <MessageSquarePlus className="size-4 text-brand" /> Nueva conversación <kbd className="ml-auto hidden rounded bg-secondary px-1.5 text-[10.5px] font-medium text-muted-foreground lg:inline">Ctrl ⇧ O</kbd>
          </button>
        )}
        {arch && (
          <button type="button" onClick={() => { setView("todas"); setSel(null) }} className="flex h-9 items-center gap-2 rounded-lg px-2 text-[14px] font-semibold hover:bg-hover">
            <ArrowLeft className="size-4" /> Volver a tus conversaciones
          </button>
        )}
        <div className="flex items-center gap-1.5">
          <label className="relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={arch ? "Buscar en archivadas" : "Buscar en tus conversaciones"} aria-label="Buscar en tus conversaciones" data-chat-search
              className="h-9 w-full rounded-full bg-secondary pr-8 pl-8 text-[13.5px] outline-none placeholder:text-placeholder focus:ring-2 focus:ring-brand/50"
              onKeyDown={(e) => { if (e.key === "ArrowDown") { e.preventDefault(); nav.current?.querySelector<HTMLButtonElement>("[data-thread-row]")?.focus() } if (e.key === "Escape" && q) { e.stopPropagation(); setQ("") } }} />
            {q && <button type="button" aria-label="Borrar búsqueda" onClick={() => setQ("")} className="absolute top-1/2 right-2 grid size-5 -translate-y-1/2 place-items-center rounded-full hover:bg-hover"><X className="size-3" /></button>}
          </label>
          <Tooltip>
            <TooltipTrigger asChild>
              <button type="button" aria-label={sel ? "Terminar selección" : "Seleccionar varias"} aria-pressed={!!sel} onClick={() => setSel(sel ? null : new Set())}
                className={cn("grid size-9 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-hover hover:text-foreground", sel && "bg-brand-soft text-link")}><CheckSquare className="size-4" /></button>
            </TooltipTrigger>
            <TooltipContent>{sel ? "Terminar selección" : "Seleccionar varias"}</TooltipContent>
          </Tooltip>
        </div>
        {sel && (
          <div className="flex flex-wrap items-center gap-1.5 rounded-xl bg-brand-soft/60 p-1.5 pl-2.5 text-[13px]" role="toolbar" aria-label="Acciones para las seleccionadas">
            <span className="font-semibold">{picked.length} seleccionada{picked.length === 1 ? "" : "s"}</span>
            <button type="button" className="text-link hover:underline" onClick={() => setSel(new Set(visible.map((t) => t.id)))}>Todas</button>
            <span className="flex-1" />
            <Button size="xs" variant="outline" disabled={!picked.length} onClick={() => { archive(picked, !arch); setSel(null) }}>{arch ? <ArchiveRestore /> : <Archive />} {arch ? "Desarchivar" : "Archivar"}</Button>
            <Button size="xs" variant="destructive" disabled={!picked.length} onClick={() => { dialogs.askDelete(picked); setSel(null) }}><Trash2 /> Eliminar</Button>
          </div>
        )}
      </div>
      <nav ref={nav} aria-label="Historial de conversaciones" onKeyDown={onKey} className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        {isPending ? (
          <div className="grid gap-2 p-1">{[0, 1, 2, 3, 4].map((i) => <Skeleton key={i} className="h-8 rounded-lg" />)}</div>
        ) : !groups.length ? (
          <div className="grid justify-items-center gap-2 px-3 py-8 text-center">
            <IsoIcon k="chat" size={48} />
            <p className="text-[13.5px] text-muted-foreground">{q ? "No encontramos conversaciones con esa búsqueda." : arch ? "No tienes conversaciones archivadas." : "Aquí verás tus conversaciones con Mirai."}</p>
          </div>
        ) : groups.map((g) => (
          <div key={g.key} className="grid gap-0.5 pt-2" role="group" aria-label={g.label}>
            <p className="px-2.5 pb-0.5 text-[11.5px] font-semibold tracking-wide text-muted-foreground uppercase">{g.label}</p>
            {g.items.map((t) => (
              <Row key={t.id} t={t} active={t.id === threadId} selecting={!!sel} selected={!!sel?.has(t.id)} onToggle={() => toggle(t.id)} dialogs={dialogs}
                onSelectMode={() => setSel(new Set([t.id]))} onOpen={() => { setThread(t.id); onPick?.() }} />
            ))}
          </div>
        ))}
      </nav>
      {!arch && nArch > 0 && (
        <button type="button" onClick={() => { setView("archivadas"); setSel(null) }} className="mx-2 mb-2 flex h-9 items-center gap-2 rounded-lg px-2.5 text-[13.5px] font-medium text-muted-foreground hover:bg-hover hover:text-foreground">
          <Archive className="size-4" /> Archivadas <span className="ml-auto rounded-full bg-secondary px-2 text-[12px]">{nArch}</span>
        </button>
      )}
      {dialogs.node}
    </div>
  )
}

/** Menú ⋯ de la conversación abierta (encabezado): las mismas opciones y el modo de las respuestas. */
export function ThreadHeaderMenu({ onRename, className }: { onRename: () => void; className?: string }) {
  const threadId = useChat((s) => s.threadId)
  const tono = useChat((s) => s.tono)
  const setTono = useChat((s) => s.setTono)
  const { data } = useThreads()
  const t = threadId ? data?.find((x) => x.id === threadId) : undefined
  const dialogs = useThreadDialogs()
  return (
    <>
      <DropdownMenu>
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>
              <button type="button" aria-label="Opciones de la conversación" className={cn("grid size-9 shrink-0 place-items-center rounded-full text-muted-foreground transition-colors hover:bg-hover hover:text-foreground", className)}>{t ? <MoreHorizontal className="size-[18px]" /> : <SlidersHorizontal className="size-4" />}</button>
            </DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent>Opciones de la conversación</TooltipContent>
        </Tooltip>
        <DropdownMenuContent align="end" className="w-60">
          {t && <><MenuEntries kit={DROP} t={t} on={{ rename: onRename, info: () => dialogs.showInfo(t), del: () => dialogs.askDelete([t]) }} /><DropdownMenuSeparator /></>}
          <DropdownMenuLabel>Cambiar modo de las respuestas</DropdownMenuLabel>
          <DropdownMenuRadioGroup value={tono} onValueChange={(v) => setTono(v as Tono)}>
            <DropdownMenuRadioItem value="simple"><span className="grid"><span className="font-medium">Sencillo</span><span className="text-xs text-muted-foreground">Palabras simples, sin tecnicismos</span></span></DropdownMenuRadioItem>
            <DropdownMenuRadioItem value="fin"><span className="grid"><span className="font-medium">Financiero</span><span className="text-xs text-muted-foreground">Términos como TEA, DTI o flujo de caja</span></span></DropdownMenuRadioItem>
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>
      {dialogs.node}
    </>
  )
}

/** Título de la conversación abierta que se puede renombrar en línea desde el encabezado. */
export function HeaderTitle({ editing, onDone, fallback, className }: { editing: boolean; onDone: () => void; fallback?: React.ReactNode; className?: string }) {
  const threadId = useChat((s) => s.threadId)
  const { data } = useThreads()
  const t = threadId ? data?.find((x) => x.id === threadId) : undefined
  if (editing && t) return <RenameInput t={t} onDone={onDone} />
  return t ? <p className={cn("truncate", className)} title={t.titulo}>{t.titulo}</p> : <>{fallback}</>
}
