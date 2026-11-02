"use client"

import { useMemo, useState } from "react"
import { usePathname } from "next/navigation"
import { ArrowRight, CircleHelp, Clock, ListChecks } from "lucide-react"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Icon } from "@/components/mirai/icon"
import { IsoIcon, hasIso } from "@/components/mirai/iso-icon"
import { Segmented } from "@/components/mirai/choice-cards"
import { SectionTitle } from "@/components/mirai/panel"
import { ToneIcon } from "@/components/mirai/tone-icon"
import { GUIDES, type Guide } from "@/lib/content/ayuda"
import { HELP } from "@/lib/content/help"
import { faqId, manualSecciones, normText, pageHref, relacionados, tokens } from "@/lib/content/centro-ayuda"
import { GLOSARIO_CATS } from "@/lib/content/glosario"
import { pageById } from "@/lib/nav"
import { cn } from "@/lib/utils"
import { AppLink, DOC_TONE, Empty, GroupLabel, Html, RowButton, SearchBox, Steps, Tips, useHelpNav } from "./ui"

const guideHref = (g: Guide) => `/${g.go}`
const filtrarGuias = (q: string) => { const ws = q.trim() ? tokens(q) : []; return GUIDES.filter((g) => ws.every((w) => normText(`${g.t} ${g.s.join(" ")} ${g.tip ?? ""}`).includes(w))) }

/** "Cómo funciona" de una sección, con pasos, consejos, enlace directo y contenido relacionado. */
export function PaginaHelp({ id }: { id: string }) {
  const { go } = useHelpNav()
  const path = usePathname()
  const h = HELP[id]
  const page = pageById(id)
  const rel = useMemo(() => relacionados(id), [id])
  if (!h) return <Empty>No tenemos ayuda para esta sección todavía.</Empty>
  const href = page?.href ?? pageHref(id)
  const here = path.split("?")[0] === href
  return (
    <article className="grid gap-5">
      <header className="grid gap-2">
        <div className="flex items-center gap-3">
          {hasIso(id) ? <IsoIcon k={id} size={48} /> : <span className="grid size-12 place-items-center rounded-xl bg-brand-soft text-brand"><Icon name={page?.icon ?? "circle-help"} className="size-6" /></span>}
          <div className="min-w-0"><p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Cómo funciona{page?.group ? ` · ${page.group.label}` : ""}</p><h2 className="text-xl leading-tight font-semibold break-words">{h.t}</h2></div>
        </div>
        <p className="leading-relaxed text-muted-foreground">{h.i}</p>
      </header>
      <Steps steps={h.p} />
      {!!h.tips?.length && <Tips tips={h.tips} />}
      {page && !here && <Button asChild className="w-fit"><AppLink href={href}>Ir a {page.label} <ArrowRight /></AppLink></Button>}
      {(rel.guias.length > 0 || rel.faqs.length > 0 || rel.lecciones.length > 0 || rel.terminos.length > 0) && (
        <section className="grid gap-1">
          <GroupLabel>Relacionado</GroupLabel>
          {rel.guias.map((g) => <RowButton key={g.id} icon="list-checks" tone={DOC_TONE.guia} title={g.t} sub={`Guía · ${g.s.length} pasos · ${g.min} min`} onClick={() => go({ v: "guia", id: g.id })} />)}
          {rel.faqs.slice(0, 5).map((f) => <RowButton key={f.q} icon="circle-help" tone={DOC_TONE.faq} title={f.q} sub={`Pregunta frecuente · ${f.c}`} onClick={() => go({ v: "faq", id: faqId(f) })} />)}
          {rel.lecciones.map((l) => <RowButton key={l.id} icon="graduation-cap" tone={DOC_TONE.leccion} title={l.titulo} sub={`Academia · ${l.minutos} min`} onClick={() => go({ v: "leccion", id: l.id })} />)}
          {rel.terminos.slice(0, 4).map((t) => <RowButton key={t.id} icon="library" tone={DOC_TONE.glosario} title={t.t} sub={`Glosario · ${GLOSARIO_CATS[t.cat].label}`} onClick={() => go({ v: "glosario", id: t.id })} />)}
        </section>
      )}
    </article>
  )
}

/** Detalle de una guía paso a paso. */
export function GuiaDetail({ id }: { id: string }) {
  const g = GUIDES.find((x) => x.id === id)
  const [hechos, setHechos] = useState<number[]>([])
  if (!g) return <Empty>No encontramos esa guía.</Empty>
  const toggle = (i: number) => setHechos((h) => (h.includes(i) ? h.filter((x) => x !== i) : [...h, i]))
  return (
    <article className="grid gap-5">
      <header className="flex items-center gap-3">
        <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-meta-tile text-white"><Icon name={g.icon} className="size-6" /></span>
        <div className="min-w-0"><p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Guía paso a paso</p><h2 className="text-xl leading-tight font-semibold break-words">{g.t}</h2><p className="flex items-center gap-1 text-xs text-muted-foreground"><Clock className="size-3.5" /> {g.min} min · {g.s.length} pasos</p></div>
      </header>
      <ol className="grid gap-2">
        {g.s.map((s, i) => (
          <li key={i}>
            <button type="button" role="checkbox" aria-checked={hechos.includes(i)} onClick={() => toggle(i)} className={cn("flex w-full gap-3 rounded-lg p-2 text-left hover:bg-hover", hechos.includes(i) && "text-muted-foreground")}>
              <span className={cn("grid size-7 shrink-0 place-items-center rounded-full text-xs font-semibold", hechos.includes(i) ? "bg-success text-white" : "bg-navy text-white dark:bg-lime dark:text-navy")}>{hechos.includes(i) ? "✓" : i + 1}</span>
              <Html html={s} className={cn("min-w-0 pt-1 leading-relaxed break-words", hechos.includes(i) && "line-through decoration-muted-foreground/50")} />
            </button>
          </li>
        ))}
      </ol>
      <p className="text-xs text-muted-foreground">Toca cada paso para marcarlo mientras lo haces. {hechos.length === g.s.length && <b className="text-success">¡Listo, terminaste la guía!</b>}</p>
      {g.tip && <Tips tips={[g.tip]} />}
      <Button asChild className="w-fit"><AppLink href={guideHref(g)}>Ir a la sección <ArrowRight /></AppLink></Button>
    </article>
  )
}

/** Lista de guías paso a paso (panel). */
export function GuiasList() {
  const { go } = useHelpNav()
  const [q, setQ] = useState("")
  const list = filtrarGuias(q)
  return (
    <div className="grid gap-3">
      <SearchBox value={q} onChange={setQ} placeholder="¿Qué quieres hacer? Ej. nómina, empeño…" label="Buscar guías" />
      {!list.length ? <Empty>No encontramos guías con “{q}”.</Empty> : (
        <div className="grid gap-1">{list.map((g) => <RowButton key={g.id} icon={g.icon} tone={DOC_TONE.guia} title={g.t} sub={`${g.s.length} pasos · ${g.min} min`} onClick={() => go({ v: "guia", id: g.id })} />)}</div>
      )}
    </div>
  )
}

/** Manual en el panel: tabla de contenido por sección del menú; cada pantalla abre su "Cómo funciona". */
export function ManualToc() {
  const { go } = useHelpNav()
  const [q, setQ] = useState("")
  const secs = manualSecciones(q)
  return (
    <div className="grid gap-4">
      <SearchBox value={q} onChange={setQ} placeholder="Busca una pantalla o una tarea…" label="Buscar en el manual" />
      {!secs.length ? <Empty>No encontramos “{q}” en el manual.</Empty> : secs.map((s) => (
        <section key={s.sec} className="grid gap-1">
          <GroupLabel>{s.sec}</GroupLabel>
          {s.items.map((i) => <RowButton key={i.id} icon={i.icon} title={i.label} sub={i.group ?? i.help.i} onClick={() => go({ v: "pagina", id: i.id })} />)}
        </section>
      ))}
      <Button variant="ghost" className="w-fit" asChild><AppLink href="/manual">Abrir el manual en página completa</AppLink></Button>
    </div>
  )
}

/** Página /manual: guías paso a paso y manual por sección con tabla de contenido. */
export function ManualModule() {
  const { go } = useHelpNav()
  const [q, setQ] = useState("")
  const [tab, setTab] = useState("guias")
  const guides = filtrarGuias(q)
  const secs = manualSecciones(q)
  const nMods = secs.reduce((n, s) => n + s.items.length, 0)
  return (
    <div className="grid gap-6">
      <SearchBox value={q} onChange={setQ} placeholder="¿Qué quieres aprender? Ej. empeño, quincena, extracto…" label="Buscar en el manual" />
      <Segmented value={tab} onChange={setTab} items={[{ value: "guias", label: `Instructivos paso a paso (${guides.length})`, icon: "list-checks" }, { value: "modulos", label: `Manual por sección (${nMods})`, icon: "book-open" }]} />
      {tab === "guias" ? (
        !guides.length ? <Empty>No encontramos instructivos con “{q}”.</Empty> : (
          <Card className="p-2 shadow-card ring-0">
            <Accordion type="single" collapsible>
              {guides.map((g) => (
                <AccordionItem key={g.id} value={g.id}>
                  <AccordionTrigger className="px-3"><span className="flex items-center gap-3 text-left"><span className="grid size-12 shrink-0 place-items-center rounded-xl bg-meta-tile text-white"><Icon name={g.icon} className="size-6" /></span><span><span className="block text-[15px] font-bold text-link">{g.t} →</span><span className="block text-xs font-normal text-muted-foreground">{g.s.length} pasos · {g.min} min</span></span></span></AccordionTrigger>
                  <AccordionContent className="grid gap-3 px-3">
                    <Steps steps={g.s} />
                    {g.tip && <Tips tips={[g.tip]} />}
                    <Button size="sm" variant="soft" className="w-fit" asChild><AppLink href={guideHref(g)}>Ir a la sección</AppLink></Button>
                  </AccordionContent>
                </AccordionItem>
              ))}
            </Accordion>
          </Card>
        )
      ) : !secs.length ? <Empty>No encontramos “{q}” en el manual.</Empty> : (
        <div className="grid gap-6 lg:grid-cols-[15rem_minmax(0,1fr)]">
          <nav aria-label="Tabla de contenido" className="lg:sticky lg:top-4 lg:self-start">
            <Card className="gap-1 p-3 shadow-card ring-0">
              <p className="flex items-center gap-2 px-1 pb-1 text-sm font-semibold"><ListChecks className="size-4 text-brand" /> Contenido</p>
              <div className="flex gap-1.5 overflow-x-auto pb-1 lg:grid lg:overflow-visible">
                {secs.map((s) => (
                  <div key={s.sec} className="contents lg:grid lg:gap-0.5">
                    <a href={`#man-${s.sec}`} className="shrink-0 rounded-full bg-secondary px-3 py-1 text-[13px] font-semibold whitespace-nowrap lg:rounded-md lg:bg-transparent lg:px-2 lg:hover:bg-hover">{s.sec}</a>
                    <span className="hidden lg:grid">{s.items.map((i) => <a key={i.id} href={`#man-${i.id}`} className="truncate rounded-md px-2 py-0.5 pl-4 text-[13px] text-muted-foreground hover:bg-hover hover:text-foreground">{i.label}</a>)}</span>
                  </div>
                ))}
              </div>
            </Card>
          </nav>
          <div className="grid min-w-0 gap-8">
            {secs.map((s) => (
              <section key={s.sec} id={`man-${s.sec}`} className="grid scroll-mt-4 gap-3">
                <SectionTitle description={`${s.items.length} ${s.items.length === 1 ? "pantalla" : "pantallas"}`}>{s.sec}</SectionTitle>
                <div className="grid gap-4 xl:grid-cols-2">
                  {s.items.map((p) => (
                    <Card key={p.id} id={`man-${p.id}`} className="h-full scroll-mt-4 gap-4 p-5 shadow-card ring-0">
                      <div className="flex items-center gap-3">{hasIso(p.id) ? <IsoIcon k={p.id} size={40} /> : <ToneIcon icon={p.icon} />}<div className="min-w-0"><h3 className="text-[15px] font-semibold break-words">{p.help.t}</h3><p className="text-sm text-muted-foreground">{p.help.i}</p></div></div>
                      <Steps steps={p.help.p} className="text-sm" />
                      {!!p.help.tips?.length && <Tips tips={p.help.tips} />}
                      <div className="mt-auto flex flex-wrap gap-2 pt-1"><Button size="sm" variant="soft" asChild><AppLink href={p.href}>Ir a {p.label}</AppLink></Button><Button size="sm" variant="ghost" onClick={() => go({ v: "pagina", id: p.id })}><CircleHelp /> Ver en el Centro de ayuda</Button></div>
                    </Card>
                  ))}
                </div>
              </section>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
