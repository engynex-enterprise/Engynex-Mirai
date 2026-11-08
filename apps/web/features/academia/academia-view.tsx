"use client"

import { useState } from "react"
import { parseAsString, useQueryState } from "nuqs"
import { Award, Check, Clock, Flame, GraduationCap, Lock, PlayCircle, Sparkles, Star } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { Skeleton } from "@/components/ui/skeleton"
import { Icon } from "@/components/mirai/icon"
import { ListToolbar, NoResults, useListControls, type ListFilter } from "@/components/mirai/list-toolbar"
import { PageHeader } from "@/components/mirai/page-header"
import { StatusPill } from "@/components/mirai/status-pill"
import { ToneIcon } from "@/components/mirai/tone-icon"
import { useAyuda } from "@/features/ayuda/use-ayuda"
import {
  APROBAR, LECCIONES, NIVELES, avance, avancePorNivel, certificados, minutosAprendidos, nivelCompleto, nivelDe, pasosDe, puntos, racha,
  siguienteLeccion, type Leccion, type Nivel,
} from "@/lib/content/academia"
import { todayISO } from "@/lib/format"
import { cn } from "@/lib/utils"
import { useHydrated } from "@/hooks/use-hydrated"
import { AvanceAcademia, NIVEL_TONE } from "./leccion"
import { LeccionPlayer } from "./player"
import { CertificadoDialog, EvaluacionDialog } from "./evaluacion"

const ORDEN: Nivel[] = ["basico", "intermedio", "avanzado"]

/** Paso en el que quedó una lección a medias (localStorage del reproductor). */
function pasoGuardado(id: string): number {
  try { return Number(localStorage.getItem(`mirai-academia-paso:${id}`)) || 0 } catch { return 0 }
}

/** Anillo de avance (SVG) con el porcentaje en el centro. */
function Anillo({ pct }: { pct: number }) {
  const r = 42, c = 2 * Math.PI * r
  return (
    <div className="relative grid size-28 shrink-0 place-items-center" role="img" aria-label={`Avance de la academia: ${pct} %`}>
      <svg viewBox="0 0 100 100" className="absolute inset-0 -rotate-90">
        <circle cx="50" cy="50" r={r} fill="none" stroke="currentColor" strokeWidth="9" className="text-white/15" />
        <circle cx="50" cy="50" r={r} fill="none" stroke="#9EDB4E" strokeWidth="9" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - pct / 100)} className="transition-[stroke-dashoffset] duration-700" />
      </svg>
      <span className="text-2xl font-bold">{pct} %</span>
    </div>
  )
}

/** Academia Mirai estilo e-learning: ruta por niveles, reproductor paso a paso, evaluaciones y certificados. */
export function AcademiaView() {
  const { academia: hechas, academiaLog, evaluaciones, isPending } = useAyuda()
  const [leccion, setLeccion] = useQueryState("leccion", parseAsString.withOptions({ history: "push" }))
  const [evalN, setEvalN] = useState<Nivel | null>(null)
  const [cert, setCert] = useState<Nivel | "completa" | null>(null)
  // El paso guardado solo existe en el navegador: se lee después de hidratar (el servidor no lo conoce).
  const hidratado = useHydrated()
  const enCurso: Record<string, number> = hidratado ? Object.fromEntries(LECCIONES.map((x) => [x.id, pasoGuardado(x.id)]).filter(([, n]) => +n > 0)) : {}

  const l = LECCIONES.find((x) => x.id === leccion)
  const filtros: ListFilter<Leccion>[] = [
    { value: "todas", label: "Todas" },
    { value: "pendientes", label: "Por hacer", match: (x) => !hechas.includes(x.id) },
    { value: "hechas", label: "Completadas", match: (x) => hechas.includes(x.id) },
  ]
  const c = useListControls(LECCIONES, { text: (x) => `${x.titulo} ${x.puntos.join(" ")}`, filters: filtros })

  const modales = (
    <>
      {evalN && <EvaluacionDialog key={evalN} nivel={evalN} open onClose={() => setEvalN(null)} onCertificado={() => { setCert(evalN); setEvalN(null) }} />}
      {cert && <CertificadoDialog nivel={cert} open onClose={() => setCert(null)} />}
    </>
  )

  if (l) return (
    <>
      <LeccionPlayer key={l.id} l={l} onSalir={() => void setLeccion(null)} onAbrir={(id) => void setLeccion(id)} onEvaluar={() => setEvalN(nivelDe(l))} />
      {modales}
    </>
  )

  const visibles = new Set(c.rows.map((x) => x.id))
  const sig = siguienteLeccion(hechas)
  const pct = avance(hechas)
  const r = racha(academiaLog, todayISO())
  const cs = certificados(hechas, evaluaciones)
  const stats = [
    { icon: Star, t: "Puntos", v: puntos(hechas, evaluaciones) },
    { icon: Clock, t: "Minutos aprendidos", v: minutosAprendidos(hechas) },
    { icon: Flame, t: r.actual === 1 ? "Día de racha" : "Días de racha", v: r.actual },
    { icon: Award, t: "Certificados", v: cs.niveles.length },
  ]

  return (
    <div className="grid gap-6">
      <PageHeader id="academia" title="Academia Mirai" description="Cursos cortos para entender tu plata: presupuesto, nómina, deudas, tasas, inversión y renta. Lecciones de 2 a 4 minutos, sin jerga." />

      <div className="grid gap-6 xl:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <Card className="gap-5 bg-[linear-gradient(120deg,#1F2B4B,#2E5B33)] p-5 text-white shadow-card ring-0 sm:p-6">
          {isPending ? <Skeleton className="h-28 bg-white/10" /> : (
            <div className="flex flex-wrap items-center gap-5">
              <Anillo pct={pct} />
              <div className="grid min-w-0 flex-1 gap-2">
                <p className="text-sm text-white/75">{sig ? (hechas.length ? "Sigue con tu ruta" : "Empieza tu ruta de aprendizaje") : "¡Graduado de la Academia!"}</p>
                {sig ? (
                  <>
                    <p className="flex items-center gap-2 text-lg leading-snug font-semibold"><Icon name={sig.icon} className="size-5 shrink-0" />{sig.titulo}</p>
                    <p className="text-sm text-white/75">{NIVELES[nivelDe(sig)].label} · {sig.minutos} min{enCurso[sig.id] ? ` · vas en el paso ${enCurso[sig.id] + 1} de ${pasosDe(sig).length}` : ""}</p>
                    <Button className="mt-1 w-fit bg-lime text-navy hover:bg-lime/90" onClick={() => void setLeccion(sig.id)}><PlayCircle /> {hechas.length || enCurso[sig.id] ? "Continuar" : "Empezar"}</Button>
                  </>
                ) : (
                  <Button className="mt-1 w-fit bg-lime text-navy hover:bg-lime/90" disabled={!cs.completa} onClick={() => setCert("completa")}><Award /> {cs.completa ? "Ver certificado de la Academia" : "Aprueba las evaluaciones para tu certificado"}</Button>
                )}
              </div>
            </div>
          )}
          <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4" aria-label="Tus números">
            {stats.map((s) => (
              <li key={s.t} className="grid gap-0.5 rounded-xl bg-white/10 p-3">
                <s.icon className="size-4 text-lime" aria-hidden />
                <span className="text-xl font-bold tabular-nums">{s.v}</span>
                <span className="text-xs text-white/75">{s.t}</span>
              </li>
            ))}
          </ul>
        </Card>
        <Card className="h-full gap-4 p-5 shadow-card ring-0">
          {isPending ? <div className="grid gap-3" aria-busy="true" aria-label="Cargando"><Skeleton className="h-5 w-40" /><Skeleton className="h-2" /><Skeleton className="h-16" /></div> : <AvanceAcademia hechas={hechas} />}
          {r.mejor > 1 && <p className="text-xs text-muted-foreground">Tu mejor racha: {r.mejor} días seguidos.</p>}
        </Card>
      </div>

      <ListToolbar c={c} placeholder="Busca una lección: tarjeta, prima, CDT…" filters={filtros} />

      {!c.rows.length ? <NoResults c={c}>No hay lecciones con esa búsqueda o ese filtro.</NoResults> : avancePorNivel(hechas).map(({ nivel, total, hechas: n, minutos }, idx) => {
        const ls = LECCIONES.filter((x) => nivelDe(x) === nivel && visibles.has(x.id))
        if (!ls.length) return null
        const completo = nivelCompleto(hechas, nivel)
        const ev = evaluaciones[nivel]
        const aprobado = (ev?.pct ?? 0) >= APROBAR
        return (
          <section key={nivel} className="grid gap-0 overflow-hidden rounded-xl bg-card shadow-card" aria-labelledby={`nivel-${nivel}`}>
            <header className="flex flex-wrap items-center gap-3 border-b p-4 sm:p-5">
              <ToneIcon icon={NIVELES[nivel].icon} tone={NIVEL_TONE[nivel]} size="lg" />
              <div className="grid min-w-0 flex-1 gap-1">
                <p className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">Módulo {ORDEN.indexOf(nivel) + 1 || idx + 1}</p>
                <h2 id={`nivel-${nivel}`} className="text-lg leading-tight font-bold">Nivel {NIVELES[nivel].label.toLowerCase()}</h2>
                <p className="text-sm text-muted-foreground">{NIVELES[nivel].desc} · {total} lecciones · {minutos} min</p>
              </div>
              <div className="grid w-full gap-1.5 sm:w-48">
                <div className="flex justify-between text-xs font-medium"><span>{n} de {total}</span><span>{Math.round((n / total) * 100)} %</span></div>
                <Progress value={(n / total) * 100} aria-label={`Avance del nivel ${NIVELES[nivel].label.toLowerCase()}`} className="h-1.5" />
              </div>
            </header>

            <ol className="relative grid p-2 sm:p-3" aria-label={`Lecciones del nivel ${NIVELES[nivel].label.toLowerCase()}`}>
              {ls.map((x, k) => {
                const ok = hechas.includes(x.id), act = sig?.id === x.id, paso = enCurso[x.id]
                return (
                  <li key={x.id} className="relative">
                    {k < ls.length - 1 && <span aria-hidden className={cn("absolute top-12 bottom-0 left-[1.6rem] w-0.5 sm:left-[1.85rem]", ok ? "bg-success/50" : "bg-border")} />}
                    {/* "Completada" va primero: el nombre accesible del botón empieza así (pruebas y lector de pantalla). */}
                    <button type="button" onClick={() => void setLeccion(x.id)}
                      className={cn("press relative flex w-full items-center gap-3 rounded-lg p-2.5 text-left hover:bg-hover focus-visible:ring-3 focus-visible:ring-ring/40 focus-visible:outline-none sm:p-3", act && "bg-brand-soft/60 hover:bg-brand-soft")}>
                      {ok && <span className="sr-only">Completada</span>}
                      <span className={cn("relative z-10 grid size-9 shrink-0 place-items-center rounded-full ring-4 ring-card", ok ? "bg-success text-white" : act ? "bg-brand-gradient text-white shadow-card" : "bg-secondary text-muted-foreground")}>
                        {ok ? <Check className="size-4" aria-hidden /> : <Icon name={x.icon} className="size-4" />}
                      </span>
                      <span className="grid min-w-0 flex-1 gap-0.5">
                        <span className="font-semibold break-words">{x.titulo}</span>
                        <span className="line-clamp-1 text-sm text-muted-foreground">{x.puntos[0]}</span>
                      </span>
                      <span className="hidden shrink-0 items-center gap-1 text-xs text-muted-foreground sm:flex"><Clock className="size-3.5" />{x.minutos} min</span>
                      {ok ? <StatusPill tone="ok" className="max-sm:hidden">Completada</StatusPill>
                        : paso ? <StatusPill tone="warn">Paso {paso + 1} de {pasosDe(x).length}</StatusPill>
                        : act ? <StatusPill tone="estimado">Sigue aquí</StatusPill> : null}
                    </button>
                  </li>
                )
              })}
            </ol>

            <footer className="flex flex-wrap items-center gap-3 border-t bg-secondary/30 p-4 sm:px-5">
              <span className={cn("grid size-9 place-items-center rounded-full", aprobado ? "bg-brand-gradient text-white" : completo ? "bg-brand-soft text-brand" : "bg-secondary text-muted-foreground")}>
                {completo ? <GraduationCap className="size-4" /> : <Lock className="size-4" />}
              </span>
              <div className="grid min-w-0 flex-1">
                <p className="text-sm font-semibold">Evaluación y certificado</p>
                <p className="text-xs text-muted-foreground">{aprobado ? `Aprobada con ${ev!.pct} %.` : ev ? `Tu mejor nota: ${ev.pct} %. Apruebas con ${APROBAR} %.` : completo ? `${total} preguntas. Apruebas con ${APROBAR} %.` : "Termina las lecciones del nivel para desbloquearla."}</p>
              </div>
              {aprobado && <Button variant="outline" size="sm" onClick={() => setCert(nivel)}><Award /> Certificado</Button>}
              <Button size="sm" variant={aprobado ? "ghost" : "default"} disabled={!completo} onClick={() => setEvalN(nivel)}>{aprobado ? "Repetir" : ev ? "Intentar de nuevo" : "Hacer la evaluación"}</Button>
            </footer>
          </section>
        )
      })}

      {cs.completa && (
        <Card className="flex-row flex-wrap items-center gap-4 p-5 shadow-card ring-0">
          <span className="bg-brand-gradient grid size-12 place-items-center rounded-full text-white"><Sparkles className="size-6" /></span>
          <div className="grid min-w-0 flex-1"><p className="font-semibold">¡Terminaste toda la Academia!</p><p className="text-sm text-muted-foreground">Ya tienes el certificado de la Academia Mirai completa.</p></div>
          <Button onClick={() => setCert("completa")}><Award /> Ver certificado</Button>
        </Card>
      )}
      {modales}
    </div>
  )
}
