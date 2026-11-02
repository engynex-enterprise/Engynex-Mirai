"use client"

import { useDeferredValue, useMemo, useState } from "react"
import { usePathname, useRouter } from "next/navigation"
import { ArrowRight, CircleHelp } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Icon } from "@/components/mirai/icon"
import { IsoIcon, hasIso } from "@/components/mirai/iso-icon"
import { useApp } from "@/components/app/app-context"
import { APP_VER, FAQ, GUIDES } from "@/lib/content/ayuda"
import { LECCIONES } from "@/lib/content/academia"
import { DOC_KINDS, buildHelpIndex, groupHits, pageIdFromPath, relacionados, searchHelp, type HelpRoute } from "@/lib/content/centro-ayuda"
import { GLOSARIO } from "@/lib/content/glosario"
import { HELP } from "@/lib/content/help"
import { cn } from "@/lib/utils"
import { DOC_TONE, Empty, GroupLabel, Html, RowButton, SearchBox, useHelpNav } from "./ui"
import { TONE, type IconTone } from "@/components/mirai/tone-icon"
import { useAyuda } from "./use-ayuda"

type Tile = { id: string; icon: string; tone: IconTone; title: string; sub: string; route?: HelpRoute; onClick?: () => void; badge?: number }

/** Portada del Centro de ayuda: buscador global, ayuda de la página actual y accesos rápidos. */
export function HelpHome() {
  const { go, close, query, setQuery } = useHelpNav()
  const path = usePathname()
  const router = useRouter()
  const { user } = useApp()
  const { noLeidas, academia, ready } = useAyuda()
  // Dentro del panel la búsqueda queda guardada en el panel (se conserva al abrir un resultado y volver con Atrás).
  const [local, setLocal] = useState("")
  const q = query ?? local
  const setQ = setQuery ?? setLocal
  const dq = useDeferredValue(q)
  const index = useMemo(() => buildHelpIndex(), [])
  const groups = useMemo(() => groupHits(searchHelp(index, dq, { limit: 40 })), [index, dq])
  const pageId = pageIdFromPath(path)
  const h = pageId ? HELP[pageId] : undefined
  const rel = useMemo(() => (pageId ? relacionados(pageId) : null), [pageId])
  const nRel = rel ? rel.faqs.length + rel.guias.length + rel.lecciones.length + rel.terminos.length : 0
  const nombre = (user.apodo || user.nombre || "").split(" ")[0]

  const tiles: Tile[] = [
    { id: "novedades", icon: "megaphone", tone: DOC_TONE.novedad, title: "Novedades", sub: ready && noLeidas.length ? `${noLeidas.length} sin leer` : `Versión ${APP_VER}`, route: { v: "novedades" }, badge: ready ? noLeidas.length : 0 },
    { id: "faq", icon: "circle-help", tone: DOC_TONE.faq, title: "Preguntas frecuentes", sub: `${FAQ.length} respuestas`, route: { v: "faq" } },
    { id: "manual", icon: "book-open", tone: DOC_TONE.pagina, title: "Manual", sub: "Cada pantalla, paso a paso", route: { v: "manual" } },
    { id: "guias", icon: "list-checks", tone: DOC_TONE.guia, title: "Guías paso a paso", sub: `${GUIDES.length} guías`, route: { v: "guias" } },
    { id: "academia", icon: "graduation-cap", tone: DOC_TONE.leccion, title: "Academia", sub: ready ? `${LECCIONES.filter((l) => academia.includes(l.id)).length} de ${LECCIONES.length} lecciones` : `${LECCIONES.length} lecciones`, route: { v: "academia" } },
    { id: "glosario", icon: "library", tone: DOC_TONE.glosario, title: "Glosario", sub: `${GLOSARIO.length} términos de Colombia`, route: { v: "glosario" } },
    { id: "tour", icon: "mouse-pointer-click", tone: "red", title: "Tour por Mirai", sub: "Recorre la pantalla en 1 minuto", onClick: () => { close(); router.push("/inicio?tour=1") } },
    { id: "atajos", icon: "command", tone: DOC_TONE.atajo, title: "Atajos de teclado", sub: "Trabaja más rápido", route: { v: "atajos" } },
  ]

  return (
    <div className="grid gap-6">
      <div className="grid gap-3 rounded-2xl bg-[linear-gradient(120deg,#1F2B4B,#2E5B33)] p-4 text-white">
        <p className="text-lg leading-tight font-semibold">{nombre ? `Hola, ${nombre}. ` : ""}¿Cómo te podemos ayudar?</p>
        <div className="text-foreground"><SearchBox value={q} onChange={setQ} placeholder="Busca en preguntas, manual, glosario…" label="Buscar en el Centro de ayuda" className="[&_input]:bg-card" /></div>
      </div>

      {dq.trim() ? (
        groups.length ? (
          <div className="grid gap-4" aria-live="polite">
            <p className="px-1 text-sm text-muted-foreground">{groups.reduce((n, g) => n + g.hits.length, 0)} resultados para “{dq}”</p>
            {groups.map((g) => (
              <section key={g.kind} className="grid gap-0.5">
                <GroupLabel>{DOC_KINDS[g.kind].label}</GroupLabel>
                {g.hits.slice(0, 6).map((hit) => <RowButton key={`${hit.kind}-${hit.id}`} icon={DOC_KINDS[hit.kind].icon} tone={DOC_TONE[hit.kind]} title={hit.title} sub={hit.sub} onClick={() => go(hit.route)} />)}
              </section>
            ))}
          </div>
        ) : (
          <Empty action={<div className="flex flex-wrap justify-center gap-2"><Button size="sm" variant="outline" onClick={() => go({ v: "soporte" })}>Escríbenos</Button><Button size="sm" variant="outline" onClick={() => go({ v: "glosario" })}>Ver el glosario</Button></div>}>
            No encontramos “{dq}”. Prueba con otra palabra o escríbenos y te ayudamos.
          </Empty>
        )
      ) : (
        <>
          {h && pageId && (
            <section className="grid gap-2" aria-label="Ayuda para esta página">
              <GroupLabel>Ayuda para esta página</GroupLabel>
              <button type="button" onClick={() => go({ v: "pagina", id: pageId })} className="press grid gap-2 rounded-xl bg-card p-4 text-left shadow-card ring-1 ring-border hover:bg-hover">
                <span className="flex items-center gap-3">
                  {hasIso(pageId) ? <IsoIcon k={pageId} size={40} /> : <span className="grid size-10 place-items-center rounded-xl bg-brand-soft text-brand"><CircleHelp className="size-5" /></span>}
                  <span className="min-w-0 flex-1"><span className="block font-semibold break-words">Cómo funciona: {h.t}</span><span className="line-clamp-2 block text-sm text-muted-foreground">{h.i}</span></span>
                  <ArrowRight className="size-4 shrink-0 text-muted-foreground" />
                </span>
                <span className="flex flex-wrap gap-x-3 text-xs text-muted-foreground"><span>{h.p.length} pasos</span>{!!h.tips?.length && <span>{h.tips.length} consejos</span>}{nRel > 0 && <span>{nRel} temas relacionados</span>}</span>
              </button>
              {h.p[0] && <p className="px-1 text-xs text-muted-foreground"><b>Primer paso:</b> <Html html={h.p[0]} /></p>}
            </section>
          )}

          <section className="grid gap-2" aria-label="Accesos rápidos">
            <GroupLabel>Explora</GroupLabel>
            <ul className="grid grid-cols-2 gap-2">
              {tiles.map((t) => (
                <li key={t.id}>
                  <button type="button" onClick={() => (t.route ? go(t.route) : t.onClick?.())} className="press relative grid h-full w-full content-start gap-2 rounded-xl bg-card p-3 text-left shadow-card ring-1 ring-border hover:bg-hover focus-visible:ring-3 focus-visible:ring-ring/40 focus-visible:outline-none">
                    <span className={cn("grid size-9 place-items-center rounded-full", TONE[t.tone])}><Icon name={t.icon} className="size-[18px]" /></span>
                    <span className="text-[14px] leading-tight font-semibold break-words">{t.title}</span>
                    <span className={cn("text-xs break-words", t.badge ? "font-semibold text-expense" : "text-muted-foreground")}>{t.sub}</span>
                    {!!t.badge && <span className="absolute top-2 right-2 grid h-5 min-w-5 place-items-center rounded-full bg-expense px-1 text-[11px] font-bold text-white" aria-label={`${t.badge} sin leer`}>{t.badge > 99 ? "99+" : t.badge}</span>}
                  </button>
                </li>
              ))}
            </ul>
          </section>

          <section className="grid gap-0.5" aria-label="Más ayuda">
            <GroupLabel>¿Necesitas más ayuda?</GroupLabel>
            <RowButton icon="sparkles" tone="violet" title="Pregúntale al Consejero IA" sub="Dudas sobre tu plata, en tus palabras" href="/consejero" />
            <RowButton icon="life-buoy" tone="blue" title="Contactar soporte" sub="Abre un caso y te respondemos aquí" onClick={() => go({ v: "soporte" })} />
            <RowButton icon="message-square-heart" tone="red" title="Tu opinión" sub="Califícanos, reporta un error o pide una idea" onClick={() => go({ v: "opinion" })} />
            <RowButton icon="activity" title="Estado del servicio" sub={`Mirai ${APP_VER} · conexión y avisos`} onClick={() => go({ v: "estado" })} tone="muted" />
          </section>
        </>
      )}
    </div>
  )
}
