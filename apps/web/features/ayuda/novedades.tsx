"use client"

import { useMemo, useState } from "react"
import { CheckCheck } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Switch } from "@/components/ui/switch"
import { IsoIcon } from "@/components/mirai/iso-icon"
import { StatusPill } from "@/components/mirai/status-pill"
import { Tip } from "@/components/mirai/tip"
import { ToneIcon, type IconTone } from "@/components/mirai/tone-icon"
import { APP_VER, RELEASES, type ReleaseItem } from "@/lib/content/ayuda"
import { filtrarNovedades, releaseKey, type KindFilter } from "@/lib/content/centro-ayuda"
import { cn } from "@/lib/utils"
import { AppLink, Chips, Empty, ListSkeleton, SearchBox } from "./ui"
import { useAyuda, useMarcarVersionVista } from "./use-ayuda"

export const KIND: Record<ReleaseItem[0], { icon: string; label: string; plural: string; tone: "pagado" | "info" | "porVencer"; color: IconTone; desc: string }> = {
  new: { icon: "sparkles", label: "Nuevo", plural: "nuevos", tone: "pagado", color: "green", desc: "Algo que antes no existía en Mirai" },
  imp: { icon: "trending-up", label: "Mejora", plural: "mejoras", tone: "info", color: "blue", desc: "Algo que ya existía y ahora funciona mejor" },
  fix: { icon: "wrench", label: "Corrección", plural: "correcciones", tone: "porVencer", color: "amber", desc: "Un error que arreglamos" },
}

/** Novedades por versión: etiquetas, filtro, marcar como leído y contador de no leídas. `compact` = panel. */
export function NovedadesModule({ compact = false }: { compact?: boolean }) {
  useMarcarVersionVista()
  const { ready, noLeidas, marcarLeidas } = useAyuda()
  const [kind, setKind] = useState<KindFilter>("todas")
  const [q, setQ] = useState("")
  const [solo, setSolo] = useState(false)
  const [todas, setTodas] = useState(!compact)
  const list = useMemo(() => filtrarNovedades(RELEASES, { kind, q, soloNoLeidas: solo, noLeidas }), [kind, q, solo, noLeidas])
  const shown = todas || q || solo || kind !== "todas" ? list : list.slice(0, 3)
  const unread = new Set(noLeidas)
  const count = (k: ReleaseItem[0]) => RELEASES.reduce((n, r) => n + r.items.filter((i) => i[0] === k).length, 0)
  const current = RELEASES.find((r) => r.v === APP_VER) ?? RELEASES[0]

  return (
    <div className="grid gap-4">
      <Card className={cn("flex-row items-center gap-4 bg-[linear-gradient(120deg,#1F2B4B,#2E5B33)] text-white shadow-card ring-0", compact ? "p-4" : "p-6")}>
        <IsoIcon k="mirai" size={compact ? 44 : 56} />
        <div className="min-w-0 flex-1">
          <StatusPill tone="ok" className="bg-lime text-navy">Versión {APP_VER}</StatusPill>
          <h2 className={cn("mt-1 font-semibold break-words", compact ? "text-base" : "text-xl")}>{current.t}</h2>
          <p className="text-sm text-white/75">{current.items.length} novedades · {current.f}</p>
        </div>
      </Card>

      <div className="flex flex-wrap items-center gap-2 rounded-xl bg-secondary/60 p-3">
        {!ready ? <span className="text-sm text-muted-foreground">Revisando qué te falta por leer…</span> : noLeidas.length ? (
          <>
            <span className="flex items-center gap-2 text-sm font-semibold"><span className="grid h-6 min-w-6 place-items-center rounded-full bg-expense px-1.5 text-xs text-white">{noLeidas.length}</span>{noLeidas.length === 1 ? "novedad sin leer" : "novedades sin leer"}</span>
            <Button size="sm" variant="soft" className="ml-auto" onClick={() => marcarLeidas(noLeidas)}><CheckCheck /> Marcar todas como leídas</Button>
          </>
        ) : <span className="flex items-center gap-2 text-sm text-success"><CheckCheck className="size-4" /> Estás al día: ya leíste todas las novedades.</span>}
      </div>

      <div className="grid gap-3">
        <SearchBox value={q} onChange={setQ} placeholder="Busca una novedad: quincena, Premium, avatar…" label="Buscar en las novedades" />
        <Chips label="Filtrar por tipo de cambio" value={kind} onChange={setKind} items={[
          { value: "todas", label: "Todas" },
          ...(["new", "imp", "fix"] as const).map((k) => ({ value: k, label: KIND[k].label, n: count(k) })),
        ]} />
        <label className="flex w-fit items-center gap-2 text-sm"><Switch checked={solo} onCheckedChange={setSolo} aria-label="Solo sin leer" /> Solo sin leer</label>
      </div>

      {!ready && solo ? <ListSkeleton rows={4} /> : !shown.length ? (
        <Empty>{solo ? "No tienes novedades sin leer con este filtro." : "No encontramos novedades con ese filtro."}</Empty>
      ) : (
        <div className="grid gap-4">
          {shown.map((r) => {
            const pend = r.items.filter((i) => unread.has(releaseKey(r.v, i[1])))
            return (
              <Card key={r.v} className={cn("gap-3 shadow-card ring-0", compact ? "p-4" : "p-5")}>
                <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                  <span className="font-mono text-sm text-muted-foreground">v{r.v}</span>
                  <h3 className="font-semibold break-words">{r.t}</h3>
                  <span className="text-sm text-muted-foreground">· {r.f}{r.v === APP_VER ? " · actual" : ""}</span>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  {(["new", "imp", "fix"] as const).map((k) => { const n = r.items.filter((i) => i[0] === k).length; return n ? <StatusPill key={k} tone={KIND[k].tone}>{n} {n === 1 ? KIND[k].label.toLowerCase() : KIND[k].plural}</StatusPill> : null })}
                  {pend.length > 0 && <Button size="xs" variant="ghost" className="ml-auto" onClick={() => marcarLeidas(pend.map((i) => releaseKey(r.v, i[1])))}>Marcar la versión como leída</Button>}
                </div>
                <ul className="grid gap-3">
                  {r.items.map(([k, t, d]) => {
                    const key = releaseKey(r.v, t)
                    const isNew = unread.has(key)
                    return (
                      <li key={t} className="flex gap-3">
                        <span className="relative shrink-0">
                          <ToneIcon icon={KIND[k].icon} tone={KIND[k].color} size="sm" />
                          {isNew && <span className="absolute -top-0.5 -right-0.5 size-2.5 rounded-full bg-expense ring-2 ring-card" aria-hidden />}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className={cn("font-medium break-words", !isNew && ready && "text-foreground/90")}>{t} <Tip label={KIND[k].desc}><span className="ml-1 inline-flex align-middle"><StatusPill tone={KIND[k].tone} className="h-5">{KIND[k].label}</StatusPill></span></Tip>{isNew && <span className="sr-only"> (sin leer)</span>}</p>
                          <p className="text-sm break-words text-muted-foreground">{d}</p>
                          {isNew && <Button size="xs" variant="link" className="h-6 px-0" onClick={() => marcarLeidas([key])} aria-label={`Marcar como leída: ${t}`}>Marcar como leída</Button>}
                        </div>
                      </li>
                    )
                  })}
                </ul>
              </Card>
            )
          })}
          {shown.length < list.length && (
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => setTodas(true)}>Ver versiones anteriores ({list.length - shown.length})</Button>
              <Button variant="ghost" asChild><AppLink href="/novedades">Abrir en página completa</AppLink></Button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
