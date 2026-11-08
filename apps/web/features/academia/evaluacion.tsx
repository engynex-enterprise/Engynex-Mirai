"use client"

import { useRef, useState } from "react"
import { ArrowRight, Award, Check, Printer, RotateCcw, X } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { ResponsiveDialog } from "@/components/mirai/responsive-dialog"
import { useApp } from "@/components/app/app-context"
import { useAyuda } from "@/features/ayuda/use-ayuda"
import { confetti } from "@/features/gami/gami-check"
import { APROBAR, NIVELES, notaEvaluacion, preguntasNivel, type Nivel } from "@/lib/content/academia"
import { fmtDate, todayISO } from "@/lib/format"
import { playSound } from "@/lib/sound"
import { cn } from "@/lib/utils"

/** Evaluación de un nivel: una pregunta por pantalla, nota al final y certificado si aprueba (70 % o más). */
export function EvaluacionDialog({ nivel, open, onClose, onCertificado }: { nivel: Nivel; open: boolean; onClose: () => void; onCertificado: () => void }) {
  const { guardarEvaluacion, evaluaciones } = useAyuda()
  const ps = preguntasNivel(nivel)
  const [resps, setResps] = useState<(number | null)[]>(() => ps.map(() => null))
  const [i, setI] = useState(0)
  const [fin, setFin] = useState(false)
  const p = ps[i]
  const nota = notaEvaluacion(nivel, resps)
  const ok = nota >= APROBAR
  const terminar = () => {
    setFin(true)
    guardarEvaluacion(nivel, nota)
    if (nota >= APROBAR) { playSound("success"); void confetti(140) } else playSound("warning")
  }
  const reiniciar = () => { setResps(ps.map(() => null)); setI(0); setFin(false) }
  return (
    <ResponsiveDialog open={open} onOpenChange={(o) => !o && onClose()} title={`Evaluación · Nivel ${NIVELES[nivel].label.toLowerCase()}`}
      description={fin ? "Tu resultado" : `${ps.length} preguntas. Apruebas con ${APROBAR} % o más.${evaluaciones[nivel] ? ` Tu mejor nota: ${evaluaciones[nivel]!.pct} %.` : ""}`}
      footer={fin ? (
        <>
          <Button variant="outline" onClick={reiniciar}><RotateCcw /> Intentar de nuevo</Button>
          {ok ? <Button onClick={onCertificado}><Award /> Ver certificado</Button> : <Button onClick={onClose}>Repasar lecciones</Button>}
        </>
      ) : (
        <>
          <Button variant="ghost" disabled={i === 0} onClick={() => setI(i - 1)}>Anterior</Button>
          {i < ps.length - 1
            ? <Button disabled={resps[i] === null} onClick={() => setI(i + 1)}>Siguiente <ArrowRight /></Button>
            : <Button disabled={resps.some((r) => r === null)} onClick={terminar}>Ver resultado</Button>}
        </>
      )}>
      {fin ? (
        <div className="grid gap-4 pb-2">
          <div className="grid justify-items-center gap-2 py-2 text-center">
            <span className={cn("grid size-20 place-items-center rounded-full text-2xl font-bold", ok ? "bg-brand-gradient text-white" : "bg-warning-soft text-warning")}>{nota} %</span>
            <p className="text-lg font-bold">{ok ? "¡Aprobaste!" : "Aún no"}</p>
            <p className="text-sm text-muted-foreground">{ok ? "Ya tienes tu certificado de este nivel." : `Necesitas ${APROBAR} % o más. Repasa las lecciones y vuelve a intentarlo.`}</p>
          </div>
          <ul className="grid gap-2" aria-label="Tus respuestas">
            {ps.map((q, k) => {
              const bien = resps[k] === q.correcta
              return (
                <li key={q.id} className="flex gap-2 rounded-lg bg-secondary/60 p-3 text-sm">
                  <span className={cn("grid size-6 shrink-0 place-items-center rounded-full text-white", bien ? "bg-success" : "bg-danger")}>{bien ? <Check className="size-3.5" /> : <X className="size-3.5" />}</span>
                  <div className="grid min-w-0 gap-0.5"><span className="font-medium">{q.q}</span>{!bien && <span className="text-muted-foreground">Respuesta: {q.opciones[q.correcta]}. {q.porque}</span>}</div>
                </li>
              )
            })}
          </ul>
        </div>
      ) : (
        <div className="grid gap-4 pb-2">
          <div className="grid gap-1.5">
            <p className="text-sm font-medium text-muted-foreground">Pregunta {i + 1} de {ps.length} · {p.titulo}</p>
            <Progress value={((i + 1) / ps.length) * 100} aria-label="Avance de la evaluación" className="h-1.5" />
          </div>
          <p className="text-lg leading-snug font-semibold">{p.q}</p>
          <div role="radiogroup" aria-label="Respuesta" className="grid gap-2">
            {p.opciones.map((o, k) => (
              <button key={o} type="button" role="radio" aria-checked={resps[i] === k} onClick={() => setResps(resps.map((r, j) => (j === i ? k : r)))}
                className={cn("press flex items-center gap-3 rounded-xl bg-card px-4 py-3 text-left text-[15px] ring-1 ring-border hover:bg-hover", resps[i] === k && "bg-brand-soft ring-2 ring-brand")}>
                <span className={cn("grid size-7 shrink-0 place-items-center rounded-full bg-secondary text-sm font-bold", resps[i] === k && "bg-brand text-white")}>{String.fromCharCode(65 + k)}</span>{o}
              </button>
            ))}
          </div>
        </div>
      )}
    </ResponsiveDialog>
  )
}

/**
 * Imprime solo un elemento (o lo guarda como PDF desde la ventana de impresión): lo copia a un iframe con los mismos
 * estilos de la página, así no salen el menú ni la ventana de atrás.
 */
function imprimir(el: HTMLElement | null) {
  if (!el) return
  const f = document.createElement("iframe")
  f.setAttribute("aria-hidden", "true")
  f.style.cssText = "position:fixed;right:0;bottom:0;width:0;height:0;border:0"
  document.body.appendChild(f)
  const d = f.contentDocument!
  const estilos = [...document.querySelectorAll('link[rel="stylesheet"], style')].map((n) => n.outerHTML).join("")
  d.open()
  d.write(`<!doctype html><html lang="es-CO"><head><meta charset="utf-8"><title>Certificado Mirai</title>${estilos}<style>@page{size:landscape;margin:1.5cm}body{background:#fff;-webkit-print-color-adjust:exact;print-color-adjust:exact}</style></head><body>${el.outerHTML}</body></html>`)
  d.close()
  const go = () => { f.contentWindow?.focus(); f.contentWindow?.print(); setTimeout(() => f.remove(), 1000) }
  // Espera a que carguen las hojas de estilo del iframe.
  setTimeout(go, 400)
}

/** Certificado de un nivel (o de la Academia completa) para guardar como PDF o imprimir. */
export function CertificadoDialog({ nivel, open, onClose }: { nivel: Nivel | "completa"; open: boolean; onClose: () => void }) {
  const { user } = useApp()
  const { evaluaciones } = useAyuda()
  const fechas = nivel === "completa" ? Object.values(evaluaciones).map((e) => e?.fecha ?? "").sort() : [evaluaciones[nivel]?.fecha ?? ""]
  const fecha = fechas.at(-1) || todayISO()
  const ref = useRef<HTMLDivElement>(null)
  const curso = nivel === "completa" ? "Academia Mirai completa" : `Nivel ${NIVELES[nivel].label.toLowerCase()}: ${NIVELES[nivel].desc.toLowerCase()}`
  return (
    <ResponsiveDialog open={open} onOpenChange={(o) => !o && onClose()} title="Tu certificado" description="Guárdalo como PDF o imprímelo desde la ventana de impresión."
      footer={<><Button variant="outline" onClick={onClose}>Cerrar</Button><Button onClick={() => imprimir(ref.current)}><Printer /> Guardar o imprimir</Button></>}>
      <div className="pb-2">
        <div ref={ref} className="relative grid gap-3 overflow-hidden rounded-2xl border-4 border-double border-[#3F7A1E] bg-white p-6 text-center text-[#1F2B4B] sm:p-10">
          <span aria-hidden className="absolute -top-16 -right-16 size-48 rounded-full bg-[#9EDB4E]/25" />
          <span aria-hidden className="absolute -bottom-20 -left-20 size-56 rounded-full bg-[#1F2B4B]/10" />
          <Award className="relative mx-auto size-12 text-[#3F7A1E]" aria-hidden />
          <p className="relative text-xs font-bold tracking-[0.3em] uppercase">Academia Mirai</p>
          <p className="relative text-sm">Certifica que</p>
          <p className="relative text-2xl font-bold sm:text-3xl" data-testid="cert-nombre">{user.nombre || user.email}</p>
          <p className="relative text-sm">completó y aprobó</p>
          <p className="relative text-lg font-semibold text-[#3F7A1E]">{curso}</p>
          <p className="relative text-sm">el {fmtDate(fecha)}</p>
          <p className="relative pt-2 text-[11px] text-[#65676B]">Constancia de aprendizaje de Mirai, finanzas personales para Colombia. No es un título académico.</p>
        </div>
      </div>
    </ResponsiveDialog>
  )
}
