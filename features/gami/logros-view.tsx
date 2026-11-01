"use client"

import Link from "next/link"
import { useQueryClient } from "@tanstack/react-query"
import { Flame } from "lucide-react"
import { toast } from "sonner"
import { Card } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { Switch } from "@/components/ui/switch"
import { Icon } from "@/components/mirai/icon"
import { PageHeader } from "@/components/mirai/page-header"
import { StatusPill } from "@/components/mirai/status-pill"
import { PageSkeleton } from "@/components/skeletons/page-skeleton"
import { useBookId, useCanEdit } from "@/components/app/app-context"
import { createClient } from "@/utils/supabase/client"
import { qk } from "@/lib/supabase/tables"
import { GBADGES, GLV, GTIER, days, parseDate } from "@/lib/domain"
import { fmtDate } from "@/lib/format"
import { cn } from "@/lib/utils"
import { BadgeArt } from "./badge"
import { useGami } from "./use-gami"

const fnum = (n: number) => Math.round(n).toLocaleString("es-CO")
const COMO = [["Registrar un gasto", "5 (hasta 10 al día)"], ["Registrar un ingreso", "20"], ["Pagar una cuota a tiempo", "25 (tarde: 10)"], ["Pagar un gasto fijo", "10"], ["Cumplir una meta", "100 + avance"], ["Cumplir un reto", "100"], ["Entrar a Mirai", "3 por día"], ["Misión semanal", "30 a 50"], ["Ganar una insignia", "50"]]

function Ring({ p, size, children }: { p: number; size: number; children: React.ReactNode }) {
  const r = (size - 10) / 2, C = 2 * Math.PI * r
  return (
    <div className="relative grid place-items-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="absolute -rotate-90"><defs><linearGradient id="ring-g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#9EDB4E" /><stop offset="1" stopColor="#3F7A1E" /></linearGradient></defs>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="currentColor" className="text-muted" strokeWidth={10} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="url(#ring-g)" strokeWidth={10} strokeLinecap="round" strokeDasharray={C} strokeDashoffset={C * (1 - Math.max(0, Math.min(1, p)))} />
      </svg>
      {children}
    </div>
  )
}

export function MissionList({ M, today }: { M: NonNullable<ReturnType<typeof useGami>>["M"]; today: string }) {
  const dleft = M.length ? days(parseDate(today), parseDate(M[0].fin)) : 0
  return (
    <div className="grid gap-3">
      <p className="text-xs text-muted-foreground">{dleft <= 1 ? "Se renuevan mañana" : `Se renuevan en ${dleft} días`}</p>
      {M.map((m) => (
        <div key={m.k} className="flex items-center gap-3">
          <span className={cn("grid size-9 shrink-0 place-items-center rounded-lg", m.ok ? "bg-success-soft text-success" : "bg-muted text-muted-foreground")}><Icon name={m.icon} className="size-4" /></span>
          <div className="min-w-0 flex-1"><p className="text-sm font-medium">{m.t}</p><p className="text-xs text-muted-foreground">{m.d}</p><Progress value={(m.p / m.goal) * 100} className="mt-1 h-1.5" /></div>
          <div className="text-right text-xs"><p className="font-semibold">{m.p} de {m.goal}</p><p className={m.ok ? "text-success" : "text-muted-foreground"}>+{m.xp}</p></div>
        </div>
      ))}
    </div>
  )
}

export function LogrosView() {
  const g = useGami()
  const bookId = useBookId()
  const canEdit = useCanEdit()
  const qc = useQueryClient()
  if (!g) return <PageSkeleton kpis={3} />
  const { X, L, st } = g
  const toggle = async (v: boolean) => {
    await createClient().from("book_settings").update({ gami: v }).eq("book_id", bookId)
    qc.invalidateQueries({ queryKey: qk(bookId, "gami") })
    toast(v ? "Logros activados" : "Logros ocultos")
  }
  const nb = Object.keys(st.unl).length
  return (
    <div className="grid gap-6">
      <PageHeader id="logros" title="Logros y nivel" description="Ganas puntos por usar Mirai y cuidar tu plata. No compites con nadie: solo contigo."
        actions={<label className="flex items-center gap-2 text-sm font-medium">Mostrar logros<Switch checked={st.on} disabled={!canEdit} onCheckedChange={toggle} aria-label="Mostrar logros" /></label>} />
      {!st.on ? <Card className="items-center p-8 text-center shadow-card ring-0"><p className="text-muted-foreground">Los logros están ocultos. Actívalos con el interruptor.</p></Card> : <>
        <Card className="flex-row flex-wrap items-center gap-6 p-6 shadow-card ring-0">
          <Ring p={L.prog} size={148}><div className="grid justify-items-center"><Icon name={L.icon} className="size-8 text-brand" /><p className="text-2xl font-semibold">{L.n}</p></div></Ring>
          <div className="grid min-w-56 flex-1 gap-2">
            <p className="text-sm text-muted-foreground">Nivel {L.n}</p>
            <h2 className="text-2xl font-semibold">{L.name}</h2>
            <p>{fnum(X.total)} puntos · {L.next ? `faltan ${fnum(L.next - X.total)} para ${L.nextName}` : "nivel máximo"}</p>
            <div className="flex gap-1.5">{GLV.map((_, i) => <span key={i} className={cn("h-2 flex-1 rounded-full", i < L.n ? "bg-lime" : "bg-muted")} />)}</div>
          </div>
          <div className="grid w-full grid-cols-3 gap-3 sm:w-auto">
            {([[<><Flame className="inline size-4 text-[#FF7A2F]" /> {g.racha}</>, `Racha (récord ${g.rachaMax})`], [`${nb}/${GBADGES.length}`, "Insignias"], [g.P.t ? `${Math.round((g.P.a / g.P.t) * 100)} %` : "—", "Cuotas a tiempo"]] as [React.ReactNode, string][]).map(([v, l]) => <div key={l} className="rounded-lg bg-muted/60 p-3 text-center"><p className="text-lg font-semibold">{v}</p><p className="text-xs text-muted-foreground">{l}</p></div>)}
          </div>
        </Card>
        <section className="grid gap-6 lg:grid-cols-[1fr_1.4fr]">
          <Card className="gap-3 p-5 shadow-card ring-0"><h2 className="font-semibold">Misiones de la semana</h2><MissionList M={g.M} today={g.today} /></Card>
          <Card className="gap-3 p-5 shadow-card ring-0">
            <h2 className="font-semibold">Insignias</h2>
            <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4">
              {GBADGES.map((b) => {
                const at = st.unl[b.id]
                return (
                  <div key={b.id} className="grid justify-items-center gap-1 text-center" title={b.d}>
                    <BadgeArt id={b.id} tier={b.tier} icon={b.icon} locked={!at} size={76} />
                    <p className="text-sm font-medium">{b.n}</p>
                    <p className="text-xs text-muted-foreground">{b.d}</p>
                    <StatusPill tone={at ? "pagado" : "gray"} className="h-5">{GTIER[b.tier][0]}{at ? ` · ${fmtDate(at)}` : ""}</StatusPill>
                  </div>
                )
              })}
            </div>
          </Card>
        </section>
        <section className="grid gap-6 lg:grid-cols-2">
          <Card className="gap-1 p-5 shadow-card ring-0">
            <h2 className="mb-2 font-semibold">De dónde vienen tus puntos</h2>
            {[...X.parts].sort((a, b) => b.v - a.v).map((p) => <div key={p.k} className="flex items-center gap-3 border-b py-2 text-sm last:border-0"><Icon name={p.icon} className="size-4 text-muted-foreground" /><span className="flex-1">{p.l} <span className="text-muted-foreground">· {p.n} {p.n === 1 ? "vez" : "veces"}</span></span><b>{fnum(p.v)}</b></div>)}
            {!X.parts.length && <p className="text-sm text-muted-foreground">Registra tu primer gasto para empezar a sumar.</p>}
          </Card>
          <Card className="gap-1 p-5 shadow-card ring-0">
            <h2 className="mb-2 font-semibold">Cómo ganar puntos</h2>
            {COMO.map(([l, v]) => <div key={l} className="flex justify-between border-b py-2 text-sm last:border-0"><span>{l}</span><b>{v}</b></div>)}
            <p className="pt-2 text-xs text-muted-foreground">Los puntos salen de lo que ya registras. No compiten con nadie. <Link href="/retos" className="underline">Ver retos de ahorro</Link></p>
          </Card>
        </section>
      </>}
    </div>
  )
}

/** Franja de nivel en Inicio (gamiStrip de la v4). */
export function GamiStrip() {
  const g = useGami()
  if (!g || !g.st.on) return null
  const pend = g.M.find((m) => !m.ok)
  return (
    <Link href="/logros" className="flex flex-wrap items-center gap-4 rounded-xl bg-card p-4 shadow-card transition-colors hover:bg-hover">
      <span className="grid size-10 place-items-center rounded-full bg-brand-soft text-brand"><Icon name={g.L.icon} className="size-5" /></span>
      <div className="min-w-48 flex-1"><p className="text-sm font-semibold">Nivel {g.L.n} · {g.L.name}</p><Progress value={g.L.prog * 100} className="mt-1 h-1.5" /><p className="mt-1 text-xs text-muted-foreground">{fnum(g.X.total)} puntos · {g.L.next ? `faltan ${fnum(g.L.next - g.X.total)} para ${g.L.nextName}` : "nivel máximo"}</p></div>
      <StatusPill tone={g.racha > 0 ? "warn" : "gray"}><Flame className="size-3" />{g.racha} {g.racha === 1 ? "día" : "días"}</StatusPill>
      <p className="w-full text-xs text-muted-foreground sm:w-auto">{pend ? <>Misión: <b className="text-foreground">{pend.t}</b> ({pend.p}/{pend.goal})</> : "¡Todas las misiones cumplidas!"}</p>
    </Link>
  )
}
