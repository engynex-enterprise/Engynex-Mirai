"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { BookOpen, Lightbulb, MessageCircle, PlayCircle, Search } from "lucide-react"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Icon } from "@/components/mirai/icon"
import { IsoIcon, hasIso } from "@/components/mirai/iso-icon"
import { PageHeader } from "@/components/mirai/page-header"
import { Segmented } from "@/components/mirai/choice-cards"
import { StatusPill } from "@/components/mirai/status-pill"
import { useShell } from "@/components/app/shell-store"
import { norm } from "@/lib/domain"
import { PAGES } from "@/lib/nav"
import { HELP } from "@/lib/content/help"
import { APP_VER, FAQ, FAQ_CATS, GUIDES, RELEASES, stripHtml } from "@/lib/content/ayuda"
import { cn } from "@/lib/utils"
import { usePrefs } from "@/features/settings/prefs"

const KIND = { new: ["sparkles", "Nuevo", "pagado"], imp: ["trending-up", "Mejora", "info"], fix: ["wrench", "Corrección", "porVencer"] } as const
const goHref = (go?: string, tab?: string) => (go ? `/${go}${tab ? `?tab=${tab}` : ""}` : null)
const Html = ({ html, className }: { html: string; className?: string }) => <span className={className} dangerouslySetInnerHTML={{ __html: html }} />

export function NovedadesView() {
  const { prefs, save } = usePrefs()
  useEffect(() => { if (prefs && prefs.seen_release !== APP_VER) { const t = setTimeout(() => save({ seen_release: APP_VER }), 400); return () => clearTimeout(t) } }, [prefs, save])
  const [top, ...rest] = RELEASES
  const counts = (r: (typeof RELEASES)[number]) => (["new", "imp", "fix"] as const).map((k) => [k, r.items.filter((i) => i[0] === k).length] as const).filter(([, n]) => n)
  const label = { new: ["nuevo", "nuevos"], imp: ["mejora", "mejoras"], fix: ["corrección", "correcciones"] }
  return (
    <div className="grid gap-6">
      <PageHeader id="novedades" title="Novedades" description="Todo lo que hemos agregado y mejorado en Mirai, de lo más nuevo a lo más antiguo." />
      <Card className="flex-row items-center gap-4 bg-[linear-gradient(120deg,#1F2B4B,#2E5B33)] p-6 text-white shadow-card ring-0">
        <IsoIcon k="mirai" size={56} />
        <div><StatusPill tone="ok" className="bg-lime text-navy">Versión {APP_VER}</StatusPill><h2 className="mt-1 text-xl font-semibold">{top.t}</h2><p className="text-sm text-white/75">{top.items.length} novedades · {top.f}</p></div>
      </Card>
      {[top, ...rest].map((r, i) => (
        <Card key={r.v} className="gap-3 p-5 shadow-card ring-0">
          <div className="flex flex-wrap items-baseline gap-2"><span className="font-mono text-sm text-muted-foreground">v{r.v}</span><h2 className="font-semibold">{r.t}</h2><span className="text-sm text-muted-foreground">· {r.f}{i === 0 ? " · actual" : ""}</span></div>
          <div className="flex flex-wrap gap-1.5">{counts(r).map(([k, n]) => <StatusPill key={k} tone={KIND[k][2]}>{n} {label[k][n === 1 ? 0 : 1]}</StatusPill>)}</div>
          <ul className="grid gap-3">
            {r.items.map(([k, t, d]) => (
              <li key={t} className="flex gap-3"><span className="grid size-8 shrink-0 place-items-center rounded-lg bg-brand-soft text-brand"><Icon name={KIND[k][0]} className="size-4" /></span><div><p className="font-medium">{t} <StatusPill tone={KIND[k][2]} className="ml-1 h-5">{KIND[k][1]}</StatusPill></p><p className="text-sm text-muted-foreground">{d}</p></div></li>
            ))}
          </ul>
        </Card>
      ))}
    </div>
  )
}

export function FaqView() {
  const [q, setQ] = useState("")
  const [cat, setCat] = useState("Todas")
  const list = useMemo(() => FAQ.filter((f) => (cat === "Todas" || f.c === cat) && (!q || norm(`${f.q} ${stripHtml(f.a)}`).includes(norm(q)))), [q, cat])
  return (
    <div className="grid gap-6">
      <PageHeader id="faq" title="Preguntas frecuentes" description="Respuestas cortas a las dudas más comunes. Busca o filtra por tema." />
      <div className="relative"><Search className="absolute top-3.5 left-3 size-4 text-muted-foreground" /><Input className="h-11 pl-9" placeholder="Busca tu duda: empeño, intereses, contraseña…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar en preguntas frecuentes" /></div>
      <div className="flex flex-wrap gap-2">
        {["Todas", ...FAQ_CATS].map((c) => <button key={c} type="button" onClick={() => setCat(c)} className={cn("rounded-full border px-3 py-1.5 text-sm", cat === c ? "border-brand bg-brand-soft font-semibold text-link" : "hover:bg-hover")}>{c} <span className="text-muted-foreground">{c === "Todas" ? FAQ.length : FAQ.filter((f) => f.c === c).length}</span></button>)}
      </div>
      {!list.length ? (
        <Card className="items-center gap-3 p-8 text-center shadow-card ring-0"><p>No encontramos “{q}”. Prueba con otra palabra o revisa el Manual.</p><Button variant="outline" asChild><Link href="/manual"><BookOpen /> Ir al manual</Link></Button></Card>
      ) : (
        <Card className="p-2 shadow-card ring-0">
          <Accordion key={q + cat} type="multiple" defaultValue={q ? list.slice(0, 3).map((f) => f.q) : []}>
            {list.map((f) => (
              <AccordionItem key={f.q} value={f.q}>
                <AccordionTrigger className="px-3 text-left">{f.q}</AccordionTrigger>
                <AccordionContent className="grid gap-3 px-3"><Html html={f.a} className="leading-relaxed" />{goHref(f.go, f.tab) && <Button size="sm" variant="soft" className="w-fit" asChild><Link href={goHref(f.go, f.tab)!}>Ir a la sección</Link></Button>}</AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </Card>
      )}
      <Card className="flex-row flex-wrap items-center gap-3 p-5 shadow-card ring-0"><p className="flex-1 font-medium">¿No encontraste tu respuesta?</p><Button variant="outline" asChild><Link href="/manual"><BookOpen /> Manual</Link></Button><Button variant="outline" asChild><Link href="/consejero"><MessageCircle /> Consejero IA</Link></Button></Card>
    </div>
  )
}

export function ManualView() {
  const [q, setQ] = useState("")
  const [tab, setTab] = useState("guias")
  const openTour = useShell((s) => s.setHelp)
  const guides = GUIDES.filter((g) => !q || norm(`${g.t} ${g.s.join(" ")} ${g.tip ?? ""}`).includes(norm(q)))
  const mods = PAGES.filter((p) => HELP[p.id]).filter((p) => !q || norm(`${HELP[p.id].t} ${HELP[p.id].i} ${stripHtml(HELP[p.id].p.join(" "))}`).includes(norm(q)))
  return (
    <div className="grid gap-6">
      <PageHeader id="manual" title="Manual e instructivos" description="Aprende a usar Mirai: guías paso a paso para las tareas más comunes y el manual de cada sección."
        actions={<Button variant="outline" asChild><Link href="/inicio?tour=1"><PlayCircle /> Ver el tour</Link></Button>} />
      <div className="relative"><Search className="absolute top-3.5 left-3 size-4 text-muted-foreground" /><Input className="h-11 pl-9" placeholder="¿Qué quieres aprender? Ej. empeño, quincena, extracto…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="Buscar en el manual" /></div>
      <Segmented value={tab} onChange={setTab} items={[{ value: "guias", label: `Instructivos paso a paso (${guides.length})`, icon: "list-checks" }, { value: "modulos", label: `Manual por sección (${mods.length})`, icon: "book-open" }]} />
      {tab === "guias" ? (
        <Card className="p-2 shadow-card ring-0">
          <Accordion type="single" collapsible>
            {guides.map((g) => (
              <AccordionItem key={g.id} value={g.id}>
                <AccordionTrigger className="px-3"><span className="flex items-center gap-3 text-left"><span className="grid size-8 place-items-center rounded-lg bg-brand-soft text-brand"><Icon name={g.icon} className="size-4" /></span><span><span className="block font-medium">{g.t}</span><span className="block text-xs font-normal text-muted-foreground">{g.s.length} pasos · {g.min} min</span></span></span></AccordionTrigger>
                <AccordionContent className="grid gap-3 px-3">
                  <ol className="grid gap-2">{g.s.map((s, i) => <li key={i} className="flex gap-3"><span className="grid size-6 shrink-0 place-items-center rounded-full bg-navy text-xs text-white dark:bg-lime dark:text-navy">{i + 1}</span><Html html={s} /></li>)}</ol>
                  {g.tip && <p className="flex gap-2 rounded-lg bg-brand-soft p-3 text-sm"><Lightbulb className="size-4 shrink-0 text-brand" /><Html html={g.tip} /></p>}
                  <Button size="sm" variant="soft" className="w-fit" asChild><Link href={`/${g.go}`}>Ir a la sección</Link></Button>
                </AccordionContent>
              </AccordionItem>
            ))}
          </Accordion>
        </Card>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {mods.map((p) => {
            const h = HELP[p.id]
            return (
              <Card key={p.id} className="gap-3 p-5 shadow-card ring-0">
                <div className="flex items-center gap-3">{hasIso(p.id) ? <IsoIcon k={p.id} size={36} /> : <Icon name={p.icon} className="size-6 text-brand" />}<div><h2 className="font-semibold">{h.t}</h2><p className="text-sm text-muted-foreground">{h.i}</p></div></div>
                <ol className="grid list-decimal gap-1 pl-5 text-sm">{h.p.map((s, i) => <li key={i}><Html html={s} /></li>)}</ol>
                {h.tips?.map((t, i) => <p key={i} className="flex gap-2 text-sm text-muted-foreground"><Lightbulb className="size-4 shrink-0" /><Html html={t} /></p>)}
                <div className="flex gap-2"><Button size="sm" variant="soft" asChild><Link href={p.href}>Ir a la sección</Link></Button><Button size="sm" variant="ghost" onClick={() => openTour(p.id)}>Ver ayuda</Button></div>
              </Card>
            )
          })}
        </div>
      )}
    </div>
  )
}
