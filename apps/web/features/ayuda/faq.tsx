"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { BookOpen, MessageCircle, Send } from "lucide-react"
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Illustration } from "@/components/mirai/illustration"
import { SectionTitle } from "@/components/mirai/panel"
import { FAQ, FAQ_CATS, type Faq } from "@/lib/content/ayuda"
import { faqId, filtrarFaq } from "@/lib/content/centro-ayuda"
import { cn } from "@/lib/utils"
import { AppLink, Chips, Html, SearchBox, Vote, useHelpNav } from "./ui"
import { useAyuda } from "./use-ayuda"

const goHref = (go?: string, tab?: string) => (go ? `/${go}${tab ? `${go.includes("?") ? "&" : "?"}tab=${tab}` : ""}` : null)

function FaqItems({ list, open, setOpen }: { list: Faq[]; open: string[]; setOpen: (v: string[]) => void }) {
  const { votos, votar, ready } = useAyuda()
  const { go } = useHelpNav()
  return (
    <Accordion type="multiple" value={open} onValueChange={setOpen}>
      {list.map((f) => {
        const id = faqId(f)
        const href = goHref(f.go, f.tab)
        return (
          <AccordionItem key={id} value={id} id={`faq-${id}`}>
            <AccordionTrigger className="px-3 text-left">{f.q}</AccordionTrigger>
            <AccordionContent className="grid gap-3 px-3">
              <Html html={f.a} className="leading-relaxed break-words" />
              {href && <Button size="sm" variant="soft" className="w-fit" asChild><AppLink href={href}>Ir a la sección</AppLink></Button>}
              {ready && <Vote value={votos[id]} onVote={(v) => votar(id, v)} onNo={() => go({ v: "soporte" })} />}
            </AccordionContent>
          </AccordionItem>
        )
      })}
    </Accordion>
  )
}

/** Preguntas frecuentes por categorías, con búsqueda, acordeón y "¿Te sirvió?". `compact` = panel. */
export function FaqModule({ compact = false, focusId }: { compact?: boolean; focusId?: string }) {
  const { go } = useHelpNav()
  const [q, setQ] = useState("")
  const [cat, setCat] = useState(() => (focusId ? FAQ.find((f) => faqId(f) === focusId)?.c ?? "Todas" : "Todas"))
  const list = useMemo(() => filtrarFaq(FAQ, { q, cat }), [q, cat])
  const [open, setOpen] = useState<string[]>(focusId ? [focusId] : [])
  // Al buscar se abren las 3 primeras respuestas (estado derivado del texto buscado, sin efecto).
  const [lastQ, setLastQ] = useState(q)
  if (lastQ !== q) { setLastQ(q); setOpen(q ? list.slice(0, 3).map(faqId) : []) }
  const root = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (focusId) setTimeout(() => root.current?.querySelector(`#faq-${CSS.escape(focusId)}`)?.scrollIntoView({ block: "start", behavior: "smooth" }), 150)
  }, [focusId])
  const grouped = cat === "Todas" && !q

  return (
    <div ref={root} className="grid gap-4">
      <SearchBox value={q} onChange={setQ} placeholder="Busca tu duda: empeño, intereses, contraseña…" label="Buscar en preguntas frecuentes" />
      <Chips label="Categorías" value={cat} onChange={setCat} items={[{ value: "Todas", label: "Todas", n: FAQ.length }, ...FAQ_CATS.map((c) => ({ value: c, label: c, n: FAQ.filter((f) => f.c === c).length }))]} />
      {!list.length ? (
        <Card className="items-center gap-3 p-6 text-center shadow-card ring-0">
          <Illustration k="sin-resultados" width={compact ? 150 : 200} />
          <p className="max-w-md text-muted-foreground">No encontramos “{q}”. Prueba con otra palabra, revisa el manual o escríbenos.</p>
          <div className="flex flex-wrap justify-center gap-2"><Button variant="outline" onClick={() => go({ v: "manual" })}><BookOpen /> Ver el manual</Button><Button onClick={() => go({ v: "soporte" })}><Send /> Escríbenos</Button></div>
        </Card>
      ) : grouped ? (
        <div className="grid gap-4">
          {FAQ_CATS.map((c) => (
            <section key={c} className="grid gap-1.5">
              <SectionTitle as="h3" className="px-1">{c} <span className="font-normal text-muted-foreground">· {FAQ.filter((f) => f.c === c).length}</span></SectionTitle>
              <Card className="p-1.5 shadow-card ring-0"><FaqItems list={list.filter((f) => f.c === c)} open={open} setOpen={setOpen} /></Card>
            </section>
          ))}
        </div>
      ) : (
        <Card className="p-1.5 shadow-card ring-0"><FaqItems list={list} open={open} setOpen={setOpen} /></Card>
      )}
      <Card className={cn("flex-row flex-wrap items-center gap-2 shadow-card ring-0", compact ? "p-4" : "p-5")}>
        <p className="min-w-40 flex-1 font-medium">¿No encontraste tu respuesta?</p>
        <Button variant="outline" asChild><AppLink href="/consejero"><MessageCircle /> Consejero IA</AppLink></Button>
        <Button onClick={() => go({ v: "soporte" })}><Send /> Pregúntanos</Button>
      </Card>
    </div>
  )
}
