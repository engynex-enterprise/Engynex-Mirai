"use client"

import { useEffect, useState } from "react"
import { usePathname } from "next/navigation"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { CircleCheck, MessageSquareReply, RefreshCw, Send } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Kbd, KbdGroup } from "@/components/ui/kbd"
import { Skeleton } from "@/components/ui/skeleton"
import { Spinner } from "@/components/ui/spinner"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { StatusPill } from "@/components/mirai/status-pill"
import { useApp } from "@/components/app/app-context"
import { usePlatformNotice } from "@/components/app/platform-notice"
import { FeedbackForm, feedbackContexto, useMyFeedback } from "@/features/opiniones/feedback-dialog"
import { Stars } from "@/features/opiniones/stars"
import { createClient } from "@/utils/supabase/client"
import { APP_VER, RELEASES } from "@/lib/content/ayuda"
import { ATAJOS, keyLabel } from "@/lib/content/centro-ayuda"
import { ESTADOS, SOPORTE_TEMAS, TIPOS, casoNumero, type FeedbackEstado, type FeedbackTipo, type SoporteCtx, type SoporteTema } from "@/lib/content/opiniones"
import { fmtDate } from "@/lib/format"
import { cn } from "@/lib/utils"
import { AppLink, Chips, Empty, ListSkeleton, RowButton, SectionTitle, useHelpNav } from "./ui"

type Fb = NonNullable<ReturnType<typeof useMyFeedback>["data"]>[number]

// ───────────────────────────── Atajos de teclado ─────────────────────────────

export function AtajosModule() {
  const [mac, setMac] = useState(false)
  useEffect(() => { queueMicrotask(() => setMac(/Mac|iPhone|iPad/i.test(navigator.platform || navigator.userAgent))) }, [])
  return (
    <div className="grid gap-4">
      <p className="text-sm text-muted-foreground">Trabaja más rápido con el teclado. En el celular no hacen falta: usa los botones de abajo.</p>
      <ul className="grid divide-y rounded-xl bg-secondary/40">
        {ATAJOS.map((a) => (
          <li key={a.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 p-3">
            <div className="min-w-0 flex-1"><p className="text-[14.5px] font-medium break-words">{a.d}</p><p className="text-xs text-muted-foreground">{a.donde}</p></div>
            <KbdGroup aria-label={a.keys.map((k) => keyLabel(k, mac)).join(" + ")}>
              {a.keys.map((k, i) => <span key={k} className="flex items-center gap-1">{i > 0 && a.id !== "resultados" && <span className="text-xs text-muted-foreground">+</span>}<Kbd className="h-6 min-w-6 bg-card px-1.5 text-[13px] shadow-card">{keyLabel(k, mac)}</Kbd></span>)}
            </KbdGroup>
          </li>
        ))}
      </ul>
    </div>
  )
}

// ───────────────────────────── Estado del servicio ─────────────────────────────

function Estado({ ok, label, detail, children }: { ok: boolean | null; label: string; detail: React.ReactNode; children?: React.ReactNode }) {
  return (
    <li className="flex items-start gap-3 p-3">
      <span className={cn("mt-1.5 size-2.5 shrink-0 rounded-full", ok === null ? "animate-pulse bg-warning" : ok ? "bg-success" : "bg-danger")} aria-hidden />
      <div className="min-w-0 flex-1"><p className="font-medium">{label}</p><div className="text-sm break-words text-muted-foreground">{detail}</div>{children}</div>
    </li>
  )
}

export function EstadoModule() {
  const { plan } = useApp()
  const { go } = useHelpNav()
  const aviso = usePlatformNotice()
  const ping = useQuery({
    queryKey: ["ayuda", "ping"], retry: 0, staleTime: 0, gcTime: 0,
    queryFn: async () => {
      const t = performance.now()
      const { error } = await createClient().from("platform_settings").select("aviso_global").limit(1).maybeSingle()
      if (error) throw new Error(error.message)
      return Math.round(performance.now() - t)
    },
  })
  const [env, setEnv] = useState<{ online: boolean; notif: string; pwa: boolean } | null>(null)
  useEffect(() => {
    const read = () => setEnv({
      online: navigator.onLine,
      notif: typeof Notification === "undefined" ? "unsupported" : Notification.permission,
      pwa: matchMedia("(display-mode: standalone)").matches,
    })
    queueMicrotask(read)
    addEventListener("online", read); addEventListener("offline", read)
    return () => { removeEventListener("online", read); removeEventListener("offline", read) }
  }, [])
  const rel = RELEASES.find((r) => r.v === APP_VER) ?? RELEASES[0]
  const notifTxt = { granted: "Permitidas en este navegador", denied: "Bloqueadas: actívalas en la configuración del navegador", default: "Aún no las has permitido", unsupported: "Este navegador no las admite" }[env?.notif ?? "default"] ?? ""
  return (
    <div className="grid gap-4">
      <ul className="grid divide-y rounded-xl bg-secondary/40">
        <Estado ok label={`Mirai ${APP_VER}`} detail={<>Versión actual · {rel.f} · <button type="button" className="font-semibold text-link hover:underline" onClick={() => go({ v: "novedades" })}>Ver novedades</button></>} />
        <Estado ok={env ? env.online : null} label="Tu conexión a internet" detail={!env ? "Revisando…" : env.online ? "Conectado" : "Sin conexión: lo que registres se guardará cuando vuelva el internet."} />
        <Estado ok={ping.isPending ? null : !ping.isError} label="Servidor de Mirai" detail={ping.isPending ? <Skeleton className="mt-1 h-4 w-32" /> : ping.isError ? "No responde en este momento. Intenta de nuevo en unos minutos." : `Funcionando · respondió en ${ping.data} ms`}>
          <Button size="xs" variant="ghost" className="mt-1 -ml-2" disabled={ping.isFetching} onClick={() => ping.refetch()}><RefreshCw className={cn(ping.isFetching && "animate-spin")} /> Volver a revisar</Button>
        </Estado>
        <Estado ok={aviso.isPending ? null : !aviso.data?.aviso_global?.trim() || aviso.data.aviso_tono !== "warn"} label="Avisos de la plataforma" detail={aviso.isPending ? "Revisando…" : aviso.data?.aviso_global?.trim() || "Sin avisos: todo funciona con normalidad."} />
        <Estado ok label="Tu plan" detail={<>{plan.nombre} · <AppLink href="/planes" className="font-semibold text-link hover:underline">Ver planes</AppLink></>} />
        <Estado ok={env ? env.notif === "granted" : null} label="Notificaciones del navegador" detail={<>{notifTxt} · <AppLink href="/ajustes?tab=alertas" className="font-semibold text-link hover:underline">Ajustes de alertas</AppLink></>} />
        <Estado ok={env ? env.pwa : null} label="Mirai como app" detail={env?.pwa ? "Estás usando Mirai instalado como app." : "Puedes instalar Mirai en la pantalla de inicio desde el menú de tu navegador (Agregar a la pantalla de inicio)."} />
      </ul>
      <div className="grid gap-1">
        <RowButton icon="bug" title="Reportar algo que no funciona" sub="Con la página donde estás y una captura opcional" onClick={() => go({ v: "opinion", tipo: "error" })} />
        <RowButton icon="life-buoy" title="Contactar soporte" sub="Abre un caso y te respondemos aquí" onClick={() => go({ v: "soporte" })} />
      </div>
    </div>
  )
}

// ───────────────────────────── Historial (opiniones y casos) ─────────────────────────────

function HistorialItem({ f }: { f: Fb }) {
  const t = TIPOS[f.tipo as FeedbackTipo] ?? TIPOS.otro
  const e = ESTADOS[f.estado as FeedbackEstado] ?? ESTADOS.nuevo
  const sop = ((f.contexto ?? {}) as { soporte?: SoporteCtx }).soporte
  const titulo = f.tipo === "soporte" ? `Caso ${casoNumero(f.id)} · ${sop?.asunto || f.mensaje.split("\n")[0]}` : t.label
  return (
    <li className="grid gap-2 rounded-xl bg-secondary/40 p-3">
      <div className="flex flex-wrap items-center gap-2">
        <p className="min-w-0 flex-1 text-sm font-semibold break-words">{titulo}</p>
        <StatusPill tone={e.tone}>{e.label}</StatusPill>
      </div>
      <p className="text-xs text-muted-foreground">{fmtDate(f.created_at.slice(0, 10))}{f.pagina ? ` · desde ${f.pagina}` : ""}{f.rating ? " · " : ""}{f.rating ? <Stars value={f.rating} /> : null}</p>
      {f.tipo !== "soporte" && f.mensaje && <p className="line-clamp-3 text-sm break-words whitespace-pre-wrap">{f.mensaje}</p>}
      {f.respuesta && (
        <div className="grid gap-1 rounded-lg bg-brand-soft p-2.5">
          <p className="flex items-center gap-1.5 text-xs font-semibold text-link"><MessageSquareReply className="size-3.5" /> Respuesta del equipo de Mirai</p>
          <p className="text-sm break-words whitespace-pre-wrap">{f.respuesta}</p>
        </div>
      )}
    </li>
  )
}

function Historial({ soporte, max = 5 }: { soporte: boolean; max?: number }) {
  const { data, isPending } = useMyFeedback()
  const list = (data ?? []).filter((f) => (f.tipo === "soporte") === soporte)
  return (
    <section className="grid gap-2">
      <SectionTitle action={list.length > max ? <AppLink href="/opiniones" className="text-xs font-semibold text-link">Ver todo</AppLink> : undefined}>{soporte ? "Tus casos" : "Lo que nos has enviado"}</SectionTitle>
      {isPending ? <ListSkeleton rows={2} /> : !list.length ? <Empty>{soporte ? "Aún no has abierto casos de soporte." : "Todavía no nos has enviado nada."}</Empty> : (
        <ul className="grid gap-2">{list.slice(0, max).map((f) => <HistorialItem key={f.id} f={f} />)}</ul>
      )}
    </section>
  )
}

// ───────────────────────────── Tu opinión ─────────────────────────────

export function OpinionPanel({ tipo }: { tipo?: string }) {
  const [k, setK] = useState(0)
  return (
    <div className="grid gap-6">
      <p className="text-sm text-muted-foreground">Califica Mirai, cuéntanos qué falla, qué te gustaría o qué te encanta. Lo leemos todo y te respondemos aquí.</p>
      <FeedbackForm key={k} draft={{ tipo }} onDone={() => setK((x) => x + 1)} compact />
      <Historial soporte={false} />
    </div>
  )
}

// ───────────────────────────── Contactar soporte ─────────────────────────────

export function SoporteModule() {
  const { user, household } = useApp()
  const { go } = useHelpNav()
  const qc = useQueryClient()
  const pathname = usePathname()
  const [tema, setTema] = useState<SoporteTema>("cuenta")
  const [asunto, setAsunto] = useState("")
  const [detalle, setDetalle] = useState("")
  const [conPagina, setConPagina] = useState(true)
  const [busy, setBusy] = useState(false)
  const [enviado, setEnviado] = useState<string | null>(null)

  const send = async () => {
    if (asunto.trim().length < 4) return toast.error("Escribe un asunto corto, por ejemplo: No puedo entrar")
    if (detalle.trim().length < 10) return toast.error("Cuéntanos un poco más para poder ayudarte")
    setBusy(true)
    const soporte: SoporteCtx = { tema, asunto: asunto.trim().slice(0, 120) }
    const { data, error } = await createClient().from("feedback").insert({
      tipo: "soporte", mensaje: `${soporte.asunto}\n\n${detalle.trim()}`.slice(0, 4000), household_id: household.id,
      pagina: conPagina ? pathname : null, contexto: feedbackContexto({ soporte }),
    }).select("id").single()
    setBusy(false)
    if (error) return toast.error("No se pudo enviar tu caso", { description: error.message })
    qc.invalidateQueries({ queryKey: ["feedback", user.id] })
    setEnviado(data.id); setAsunto(""); setDetalle("")
  }

  if (enviado) {
    return (
      <div className="grid gap-6">
        <div className="grid justify-items-center gap-2 rounded-xl bg-success-soft p-6 text-center" role="status">
          <CircleCheck className="size-10 text-success" />
          <p className="text-lg font-semibold">Recibimos tu caso {casoNumero(enviado)}</p>
          <p className="text-sm text-muted-foreground">Te respondemos aquí y en Tu opinión. Te llega un aviso cuando lo hagamos.</p>
          <Button variant="outline" onClick={() => setEnviado(null)}>Abrir otro caso</Button>
        </div>
        <Historial soporte />
      </div>
    )
  }

  return (
    <div className="grid gap-5">
      <div className="grid gap-1">
        <p className="text-sm text-muted-foreground">Antes de escribirnos, quizás ya esté resuelto:</p>
        <RowButton icon="circle-help" title="Preguntas frecuentes" sub="Respuestas cortas a las dudas más comunes" onClick={() => go({ v: "faq" })} />
        <RowButton icon="sparkles" title="Pregúntale al Consejero IA" sub="Dudas sobre tu plata, en tus palabras" href="/consejero" />
      </div>
      <div className="grid gap-4 rounded-xl bg-secondary/40 p-4">
        <div className="grid gap-2"><p className="text-sm font-semibold">¿Con qué necesitas ayuda?</p>
          <Chips label="Tema del caso" value={tema} onChange={setTema} items={SOPORTE_TEMAS.map((t) => ({ value: t.value, label: t.label }))} />
        </div>
        <label className="grid gap-1.5 text-sm font-semibold" htmlFor="sop-asunto">Asunto
          <Input id="sop-asunto" maxLength={120} placeholder="Ej.: No me llega el correo para cambiar la contraseña" value={asunto} onChange={(e) => setAsunto(e.target.value)} className="font-normal" />
        </label>
        <label className="grid gap-1.5 text-sm font-semibold" htmlFor="sop-detalle">Cuéntanos qué pasa
          <Textarea id="sop-detalle" rows={5} maxLength={3800} placeholder="Qué estabas haciendo, qué esperabas y qué pasó. Si viste un mensaje de error, cópialo aquí." value={detalle} onChange={(e) => setDetalle(e.target.value)} className="font-normal" />
        </label>
        <label className="flex items-start gap-3 text-sm">
          <Switch checked={conPagina} onCheckedChange={setConPagina} aria-label="Incluir la página donde estás" className="mt-0.5" />
          <span className="min-w-0"><span className="block font-medium">Incluir la página donde estás</span><span className="block break-all text-xs text-muted-foreground">{pathname}</span></span>
        </label>
        <p className="text-xs text-muted-foreground">Incluimos la versión de Mirai y tu tipo de pantalla. Nunca enviamos tus montos ni tus datos financieros.</p>
        <Button onClick={send} disabled={busy} className="w-fit">{busy ? <Spinner /> : <Send />} Enviar caso</Button>
      </div>
      <Historial soporte />
    </div>
  )
}
