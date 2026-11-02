"use client"

import { useMemo, useState } from "react"
import { ArrowRight, Info } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Icon } from "@/components/mirai/icon"
import { StatusPill } from "@/components/mirai/status-pill"
import { normText, tokens } from "@/lib/content/centro-ayuda"
import { GLOSARIO, GLOSARIO_CATS, glosarioById, type GlosarioCat, type Termino } from "@/lib/content/glosario"
import { AppLink, Chips, Empty, RowButton, SearchBox, SectionTitle, useHelpNav } from "./ui"

const CATS = Object.keys(GLOSARIO_CATS) as GlosarioCat[]

/** Glosario financiero de Colombia: búsqueda, categorías y lista alfabética. */
export function GlosarioList() {
  const { go } = useHelpNav()
  const [q, setQ] = useState("")
  const [cat, setCat] = useState<"todas" | GlosarioCat>("todas")
  const list = useMemo(() => {
    const ws = q.trim() ? tokens(q) : []
    return GLOSARIO.filter((t) => (cat === "todas" || t.cat === cat) && ws.every((w) => normText(`${t.t} ${t.sigla ?? ""} ${t.d}`).includes(w)))
      .sort((a, b) => a.t.localeCompare(b.t, "es"))
  }, [q, cat])
  const letras = useMemo(() => [...new Set(list.map((t) => normText(t.t)[0]?.toUpperCase() ?? "#"))], [list])
  return (
    <div className="grid gap-4">
      <p className="text-sm text-muted-foreground">Las palabras de la plata en Colombia, explicadas en simple. Los valores que cambian cada año (UVT, salario mínimo, topes) los toma Mirai de las fuentes oficiales.</p>
      <SearchBox value={q} onChange={setQ} placeholder="Busca: UVT, prima, usura, CDT…" label="Buscar en el glosario" />
      <Chips label="Temas del glosario" value={cat} onChange={setCat} items={[{ value: "todas", label: "Todos", n: GLOSARIO.length }, ...CATS.map((c) => ({ value: c, label: GLOSARIO_CATS[c].label, n: GLOSARIO.filter((t) => t.cat === c).length }))]} />
      {!list.length ? <Empty>No encontramos “{q}”. Prueba con otra palabra o pregúntale al Consejero IA.</Empty> : letras.map((l) => (
        <section key={l} className="grid gap-0.5">
          <SectionTitle>{l}</SectionTitle>
          {list.filter((t) => (normText(t.t)[0]?.toUpperCase() ?? "#") === l).map((t) => (
            <RowButton key={t.id} icon={GLOSARIO_CATS[t.cat].icon} title={t.t} sub={t.sigla ?? GLOSARIO_CATS[t.cat].label} onClick={() => go({ v: "glosario", id: t.id })} />
          ))}
        </section>
      ))}
    </div>
  )
}

/** Un término del glosario. */
export function TerminoDetail({ id }: { id: string }) {
  const { go } = useHelpNav()
  const t = glosarioById(id)
  if (!t) return <Empty>No encontramos ese término.</Empty>
  const ver = (t.ver ?? []).map(glosarioById).filter((x): x is Termino => !!x)
  return (
    <article className="grid gap-4">
      <header className="grid gap-1">
        <p className="flex items-center gap-1.5 text-xs font-semibold tracking-wide text-muted-foreground uppercase"><Icon name={GLOSARIO_CATS[t.cat].icon} className="size-3.5" /> Glosario · {GLOSARIO_CATS[t.cat].label}</p>
        <h2 className="text-2xl leading-tight font-semibold break-words">{t.t}</h2>
        {t.sigla && <p className="text-sm text-muted-foreground">{t.sigla}</p>}
      </header>
      <p className="text-[15px] leading-relaxed">{t.d}</p>
      {t.ej && <div className="rounded-xl bg-secondary/60 p-4 text-sm"><p className="mb-1 font-semibold">Ejemplo</p><p>{t.ej}</p></div>}
      {t.ref && (
        <p className="flex gap-2 rounded-xl bg-info-soft p-3 text-sm text-info"><Info className="mt-0.5 size-4 shrink-0" /><span><StatusPill tone="info" className="mr-1 h-5 bg-card">Referencia</StatusPill>Este tema depende de valores que cambian cada año o por ley. Mirai usa los valores oficiales vigentes; para decisiones importantes confírmalos con la DIAN o tu contador.</span></p>
      )}
      {t.ir && <Button asChild className="w-fit"><AppLink href={t.ir.href}>{t.ir.label} <ArrowRight /></AppLink></Button>}
      {ver.length > 0 && (
        <section className="grid gap-1">
          <SectionTitle>Mira también</SectionTitle>
          {ver.map((v) => <RowButton key={v.id} icon={GLOSARIO_CATS[v.cat].icon} title={v.t} sub={v.sigla ?? GLOSARIO_CATS[v.cat].label} onClick={() => go({ v: "glosario", id: v.id })} />)}
        </section>
      )}
    </article>
  )
}
