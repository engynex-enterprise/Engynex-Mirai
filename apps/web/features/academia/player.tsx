"use client"

import { useCallback, useEffect, useMemo, useState } from "react"
import Link from "next/link"
import { ArrowLeft, ArrowRight, Check, CircleCheck, Clock, GraduationCap, Lightbulb, NotebookPen, PartyPopper, Square, Volume2, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Textarea } from "@/components/ui/textarea"
import { Icon } from "@/components/mirai/icon"
import { StatusPill } from "@/components/mirai/status-pill"
import { ToneIcon } from "@/components/mirai/tone-icon"
import { useShell } from "@/components/app/shell-store"
import { useAyuda } from "@/features/ayuda/use-ayuda"
import { confetti } from "@/features/gami/gami-check"
import { NIVELES, XP_LECCION, insignias, leccionesDe, nivelCompleto, nivelDe, pasosDe, siguienteLeccion, type Leccion } from "@/lib/content/academia"
import { glosarioById, type Termino } from "@/lib/content/glosario"
import { playSound } from "@/lib/sound"
import { cn } from "@/lib/utils"
import { useHydrated } from "@/hooks/use-hydrated"
import { NIVEL_TONE } from "./leccion"

/** Primera frase de una idea (para "Lo que vas a aprender"). */
const frase = (t: string) => (t.match(/^.+?[.:](?=\s|$)/)?.[0] ?? t).replace(/[.:]$/, "")
const PASO_KEY = (id: string) => `mirai-academia-paso:${id}`

/** Leer en voz alta con la voz del navegador (español; de Colombia si existe). Sin servicios externos. */
function useVoz() {
  const [habla, setHabla] = useState(false)
  // Solo después de hidratar (el servidor no sabe si el navegador tiene voz: si no, React avisa #418).
  const ok = useHydrated() && "speechSynthesis" in window
  const parar = useCallback(() => { if (ok) window.speechSynthesis.cancel(); setHabla(false) }, [ok])
  const leer = useCallback((texto: string) => {
    if (!ok) return
    window.speechSynthesis.cancel()
    const u = new SpeechSynthesisUtterance(texto)
    const voces = window.speechSynthesis.getVoices()
    u.voice = voces.find((v) => v.lang === "es-CO") ?? voces.find((v) => v.lang.startsWith("es")) ?? null
    u.lang = u.voice?.lang ?? "es-CO"
    u.rate = 0.98
    u.onend = () => setHabla(false)
    u.onerror = () => setHabla(false)
    setHabla(true)
    window.speechSynthesis.speak(u)
  }, [ok])
  useEffect(() => () => { if (ok) window.speechSynthesis.cancel() }, [ok])
  return { ok, habla, leer, parar }
}

/** Reproductor de una lección estilo e-learning: un paso por pantalla, repaso, resultado, apuntes y temario del nivel. */
export function LeccionPlayer({ l, onSalir, onAbrir, onEvaluar }: { l: Leccion; onSalir: () => void; onAbrir: (id: string) => void; onEvaluar: () => void }) {
  const { academia: hechas, notas, terminarLeccion, guardarNota } = useAyuda()
  const setHelp = useShell((s) => s.setHelp)
  const pasos = useMemo(() => pasosDe(l), [l])
  const yaHecha = hechas.includes(l.id)
  // El paso guardado vive en el navegador: se usa después de hidratar (si no, el servidor dibujaría otro paso, #418).
  const hidratado = useHydrated()
  const [elegido, setI] = useState<number | null>(null)
  const guardado = (() => {
    if (!hidratado || yaHecha) return 0
    try { const n = Number(localStorage.getItem(PASO_KEY(l.id))); return n > 0 && n < pasos.length - 1 ? n : 0 } catch { return 0 }
  })()
  const i = elegido ?? guardado
  const [resp, setResp] = useState<number | null>(null)
  const [antes] = useState(() => insignias(hechas).filter((b) => b.ok).map((b) => b.id))
  const voz = useVoz()
  const paso = pasos[i]
  const acerto = resp === l.pregunta.correcta
  const puedeSeguir = paso.tipo !== "repaso" || acerto || yaHecha
  const nivel = nivelDe(l)
  const terms = (l.glosario ?? []).map(glosarioById).filter((t): t is Termino => !!t)

  const ir = useCallback((n: number) => {
    voz.parar()
    const k = Math.max(0, Math.min(pasos.length - 1, n))
    setI(k)
    try { if (k < pasos.length - 1) localStorage.setItem(PASO_KEY(l.id), String(k)); else localStorage.removeItem(PASO_KEY(l.id)) } catch { /* sin almacenamiento */ }
    window.scrollTo({ top: 0, behavior: "smooth" })
  }, [pasos.length, l.id, voz])

  // Al llegar al resultado: se guarda la lección (con su fecha, para la racha) y se celebra.
  useEffect(() => {
    if (paso.tipo !== "fin") return
    if (!yaHecha) { terminarLeccion(l.id); void confetti(90) }
  }, [paso.tipo]) // eslint-disable-line react-hooks/exhaustive-deps

  // Teclado: → siguiente, ← anterior (no mientras se escribe un apunte).
  useEffect(() => {
    const on = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === "TEXTAREA" || t.tagName === "INPUT" || t.isContentEditable)) return
      if (e.key === "ArrowRight" && puedeSeguir && i < pasos.length - 1) ir(i + 1)
      if (e.key === "ArrowLeft" && i > 0) ir(i - 1)
    }
    window.addEventListener("keydown", on)
    return () => window.removeEventListener("keydown", on)
  }, [i, puedeSeguir, pasos.length, ir])

  const textoPaso = paso.tipo === "intro" ? `${l.titulo}. Lo que vas a aprender: ${l.puntos.map(frase).join(". ")}.`
    : paso.tipo === "punto" ? l.puntos[paso.i]
    : paso.tipo === "repaso" ? `${l.pregunta.q} Opciones: ${l.pregunta.opciones.join(", ")}.`
    : "¡Lección completada!"

  const hechasAhora = yaHecha || paso.tipo === "fin" ? [...new Set([...hechas, l.id])] : hechas
  const sig = siguienteLeccion(hechasAhora)
  const nuevas = insignias(hechasAhora).filter((b) => b.ok && !antes.includes(b.id))
  const delNivel = leccionesDe(nivel)

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="ghost" size="sm" onClick={() => { voz.parar(); onSalir() }}><ArrowLeft /> Academia</Button>
        <span className="hidden text-sm text-muted-foreground sm:inline">/ Nivel {NIVELES[nivel].label.toLowerCase()}</span>
        <div className="ml-auto flex items-center gap-2">
          {voz.ok && (
            <Button variant="outline" size="sm" onClick={() => (voz.habla ? voz.parar() : voz.leer(textoPaso))} aria-pressed={voz.habla}>
              {voz.habla ? <><Square /> Detener</> : <><Volume2 /> Escuchar</>}
            </Button>
          )}
          <span className="text-sm font-medium text-muted-foreground tabular-nums" aria-live="polite">Paso {i + 1} de {pasos.length}</span>
        </div>
      </div>

      <div className="flex gap-1" role="progressbar" aria-label="Avance de la lección" aria-valuemin={1} aria-valuemax={pasos.length} aria-valuenow={i + 1}>
        {pasos.map((_, k) => (
          <button key={k} type="button" tabIndex={-1} aria-hidden onClick={() => (k <= i || yaHecha) && ir(k)}
            className={cn("h-1.5 flex-1 rounded-full transition-colors", k <= i ? "bg-brand" : "bg-secondary", (k <= i || yaHecha) && "cursor-pointer")} />
        ))}
      </div>

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_19rem]">
        <Card className="min-h-[26rem] gap-0 overflow-hidden p-0 shadow-card ring-0">
          <div key={i} className="appear grid flex-1 content-start gap-5 p-6 sm:p-10">
            {paso.tipo === "intro" && (
              <>
                <div className="flex items-center gap-3">
                  <ToneIcon icon={l.icon} tone={NIVEL_TONE[nivel]} size="lg" />
                  <StatusPill tone="estimado">{NIVELES[nivel].label}</StatusPill>
                  {yaHecha && <StatusPill tone="ok" check>Completada</StatusPill>}
                </div>
                <h2 className="text-2xl leading-tight font-bold tracking-tight sm:text-[32px] sm:leading-10">{l.titulo}</h2>
                <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
                  <span className="flex items-center gap-1"><Clock className="size-4" /> {l.minutos} min</span>
                  <span className="flex items-center gap-1"><Lightbulb className="size-4" /> {l.puntos.length} ideas</span>
                  <span className="flex items-center gap-1"><CircleCheck className="size-4" /> 1 repaso</span>
                </p>
                <div className="grid gap-2 rounded-xl bg-secondary/60 p-4">
                  <p className="text-sm font-semibold">Lo que vas a aprender</p>
                  <ul className="grid gap-2">
                    {l.puntos.map((p, k) => <li key={k} className="flex gap-2 text-[15px]"><Check className="mt-0.5 size-4 shrink-0 text-success" />{frase(p)}</li>)}
                  </ul>
                </div>
              </>
            )}

            {paso.tipo === "punto" && (
              <>
                <p className="text-sm font-semibold text-link">Idea {paso.i + 1} de {l.puntos.length}</p>
                <div className="flex gap-4">
                  <span className="bg-brand-gradient grid size-12 shrink-0 place-items-center rounded-2xl text-xl font-bold text-white shadow-card">{paso.i + 1}</span>
                  <p className="min-w-0 text-[19px] leading-8 break-words sm:text-[21px] sm:leading-9">{l.puntos[paso.i]}</p>
                </div>
                {paso.i === l.puntos.length - 1 && terms.length > 0 && (
                  <div className="flex flex-wrap items-center gap-1.5 border-t pt-4 text-sm"><span className="text-muted-foreground">Palabras clave:</span>
                    {terms.map((t) => <button key={t.id} type="button" onClick={() => setHelp(`@glosario:${t.id}`)} className="rounded-full bg-secondary px-2.5 py-0.5 text-[13px] font-medium text-link hover:bg-secondary-hover">{t.t}</button>)}
                  </div>
                )}
              </>
            )}

            {paso.tipo === "repaso" && (
              <>
                <p className="text-sm font-semibold text-link">Repaso</p>
                <h2 className="text-xl leading-snug font-bold sm:text-2xl">{l.pregunta.q}</h2>
                <div role="radiogroup" aria-label="Respuesta" className="grid gap-2">
                  {l.pregunta.opciones.map((o, k) => {
                    const sel = resp === k, bien = k === l.pregunta.correcta
                    return (
                      <button key={o} type="button" role="radio" aria-checked={sel} disabled={acerto}
                        onClick={() => { setResp(k); playSound(bien ? "success" : "error") }}
                        className={cn("press flex items-center gap-3 rounded-xl bg-card px-4 py-3.5 text-left text-[15px] font-medium ring-1 ring-border transition hover:bg-hover disabled:cursor-default",
                          sel && (bien ? "bg-success-soft ring-2 ring-success" : "bg-danger-soft ring-2 ring-danger"))}>
                        <span className={cn("grid size-7 shrink-0 place-items-center rounded-full bg-secondary text-sm font-bold", sel && (bien ? "bg-success text-white" : "bg-danger text-white"))}>
                          {sel ? (bien ? <Check className="size-4" /> : <X className="size-4" />) : String.fromCharCode(65 + k)}
                        </span>
                        {o}
                      </button>
                    )
                  })}
                </div>
                {resp !== null && (
                  <p role="status" className={cn("rounded-lg p-3 text-sm", acerto ? "bg-success-soft text-success" : "bg-danger-soft text-danger")}>
                    {acerto ? <><b>¡Correcto!</b> {l.pregunta.porque}</> : "Casi. Vuelve a leer la idea y intenta de nuevo."}
                  </p>
                )}
              </>
            )}

            {paso.tipo === "fin" && (
              <div className="grid justify-items-center gap-4 py-4 text-center">
                <span className="bg-brand-gradient grid size-20 place-items-center rounded-full text-white shadow-card"><PartyPopper className="size-9" /></span>
                <h2 className="text-2xl font-bold">¡Lección completada!</h2>
                <p className="max-w-md text-muted-foreground">Terminaste «{l.titulo}». {yaHecha && !nuevas.length ? "Repasar también cuenta." : `Ganaste ${XP_LECCION} puntos.`}</p>
                {nuevas.length > 0 && (
                  <ul className="flex flex-wrap justify-center gap-2" aria-label="Insignias nuevas">
                    {nuevas.map((b) => <li key={b.id} className="inline-flex items-center gap-2 rounded-full bg-brand-soft py-1 pr-3 pl-1 text-sm font-semibold"><span className="bg-brand-gradient grid size-7 place-items-center rounded-full text-white"><Icon name={b.icon} className="size-4" /></span>Insignia: {b.label}</li>)}
                  </ul>
                )}
                <div className="flex flex-wrap justify-center gap-2 pt-2">
                  {l.ir && <Button variant="outline" asChild><Link href={l.ir.href}>{l.ir.label} <ArrowRight /></Link></Button>}
                  {nivelCompleto(hechasAhora, nivel) && <Button variant="outline" onClick={onEvaluar}><GraduationCap /> Evaluación del nivel</Button>}
                  {sig && sig.id !== l.id ? <Button onClick={() => onAbrir(sig.id)}>Siguiente: {sig.titulo} <ArrowRight /></Button> : <Button onClick={onSalir}>Volver a la Academia</Button>}
                </div>
              </div>
            )}
          </div>

          {paso.tipo !== "fin" && (
            <div className="flex items-center justify-between gap-2 border-t bg-secondary/30 px-6 py-4 sm:px-10">
              <Button variant="ghost" disabled={i === 0} onClick={() => ir(i - 1)}><ArrowLeft /> Anterior</Button>
              <Button disabled={!puedeSeguir} title={puedeSeguir ? undefined : "Responde bien el repaso para seguir"} onClick={() => ir(i + 1)}>
                {paso.tipo === "intro" ? "Empezar" : paso.tipo === "repaso" ? "Terminar lección" : "Siguiente"} <ArrowRight />
              </Button>
            </div>
          )}
        </Card>

        <aside className="grid gap-4">
          <Card className="gap-2 p-4 shadow-card ring-0">
            <p className="text-sm font-semibold">Nivel {NIVELES[nivel].label.toLowerCase()}</p>
            <ol className="grid gap-0.5" aria-label="Temario del nivel">
              {delNivel.map((x) => {
                const ok = hechasAhora.includes(x.id), act = x.id === l.id
                return (
                  <li key={x.id}>
                    <button type="button" onClick={() => !act && onAbrir(x.id)} aria-current={act ? "step" : undefined}
                      className={cn("flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left text-sm hover:bg-hover", act && "bg-brand-soft font-semibold hover:bg-brand-soft")}>
                      <span className={cn("grid size-6 shrink-0 place-items-center rounded-full text-xs", ok ? "bg-success text-white" : act ? "bg-brand text-white" : "bg-secondary text-muted-foreground")}>
                        {ok ? <Check className="size-3.5" /> : <Icon name={x.icon} className="size-3.5" />}
                      </span>
                      <span className="min-w-0 flex-1 truncate">{x.titulo}</span>
                      <span className="text-xs text-muted-foreground">{x.minutos}′</span>
                    </button>
                  </li>
                )
              })}
            </ol>
          </Card>
          <Apuntes key={l.id} valor={notas[l.id] ?? ""} onGuardar={(t) => guardarNota(l.id, t)} />
        </aside>
      </div>
    </div>
  )
}

/** Apuntes personales de la lección (se guardan en tu cuenta al salir del campo). */
function Apuntes({ valor, onGuardar }: { valor: string; onGuardar: (t: string) => void }) {
  const [t, setT] = useState(valor)
  const [ok, setOk] = useState(false)
  return (
    <Card className="gap-2 p-4 shadow-card ring-0">
      <label htmlFor="apuntes" className="flex items-center gap-2 text-sm font-semibold"><NotebookPen className="size-4 text-brand" /> Mis apuntes</label>
      <Textarea id="apuntes" rows={4} maxLength={2000} value={t} placeholder="Escribe lo que quieras recordar o aplicar…" onChange={(e) => { setT(e.target.value); setOk(false) }}
        onBlur={() => { if (t !== valor) { onGuardar(t); setOk(true) } }} />
      <p className="text-xs text-muted-foreground" aria-live="polite">{ok ? "Guardado en tu cuenta." : "Se guardan en tu cuenta, en todos tus dispositivos."}</p>
    </Card>
  )
}

