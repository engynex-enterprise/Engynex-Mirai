"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { usePathname, useRouter } from "next/navigation"
import { useQueryClient } from "@tanstack/react-query"
import { useQuery } from "@/lib/query"
import { ImagePlus, Send } from "lucide-react"
import { toast } from "@/components/mirai/toast"
import { Button } from "@/components/ui/button"
import { FieldGroup } from "@/components/ui/field"
import { Switch } from "@/components/ui/switch"
import { Textarea } from "@/components/ui/textarea"
import { SubmitButton } from "@/components/mirai/submit-button"
import { IconButton } from "@/components/mirai/tip"
import { ChoiceCards } from "@/components/mirai/choice-cards"
import { FormField } from "@/components/mirai/field"
import { ResponsiveDialog } from "@/components/mirai/responsive-dialog"
import { useApp } from "@/components/app/app-context"
import { useShell, type FeedbackDraft } from "@/components/app/shell-store"
import { loadMyFeedback, sendFeedback, uploadCaptura } from "./api"
import { APP_VER } from "@/lib/content/ayuda"
import { TIPOS, TIPO_FORM, type FeedbackTipo } from "@/lib/content/opiniones"
import { StarRating } from "./stars"

const MAX_IMG = 5 * 1024 * 1024

/** Opiniones propias (Mis opiniones y la tarjeta de Inicio). */
export function useMyFeedback() {
  const { user } = useApp()
  return useQuery({
    queryKey: ["feedback", user.id],
    queryFn: () => loadMyFeedback(),
  })
}

/** Datos técnicos que acompañan una opinión o un caso de soporte (nunca montos ni datos financieros). */
export function feedbackContexto(extra: Record<string, unknown> = {}) {
  return {
    version: APP_VER, pantalla: `${window.innerWidth}×${window.innerHeight}`, tema: document.documentElement.classList.contains("dark") ? "oscuro" : "claro",
    navegador: navigator.userAgent.slice(0, 200), idioma: navigator.language, ...extra,
  }
}

/** Formulario de "Tu opinión". Se usa en la ventana y dentro del Centro de ayuda (`compact`). */
export function FeedbackForm({ draft, onDone, compact = false }: { draft: FeedbackDraft; onDone: () => void; compact?: boolean }) {
  const { user, household } = useApp()
  const qc = useQueryClient()
  const router = useRouter()
  const pathname = usePathname()
  const [tipo, setTipo] = useState<FeedbackTipo>((draft.tipo as FeedbackTipo) in TIPOS ? (draft.tipo as FeedbackTipo) : "calificacion")
  const [rating, setRating] = useState(draft.rating ?? 0)
  const [mensaje, setMensaje] = useState(draft.mensaje ?? "")
  const [file, setFile] = useState<File | null>(null)
  const [busy, setBusy] = useState(false)
  const [conPagina, setConPagina] = useState(true)
  const input = useRef<HTMLInputElement>(null)
  const t = TIPOS[tipo]
  const preview = useMemo(() => (file ? URL.createObjectURL(file) : null), [file])
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview) }, [preview])

  const pick = (f?: File) => {
    if (!f) return
    if (!f.type.startsWith("image/")) return toast.error("Adjunta una imagen (captura de pantalla)")
    if (f.size > MAX_IMG) return toast.error("La imagen pesa más de 5 MB")
    setFile(f)
  }

  // Calificar pide las estrellas (el comentario es opcional); los demás tipos piden un mensaje de al menos 3 letras.
  const falta = tipo === "calificacion" ? (!rating ? "Elige de 1 a 5 estrellas" : null) : mensaje.trim().length < 3 ? "Cuéntanos un poco más (al menos 3 letras)" : null

  const send = async () => {
    if (falta || busy) return
    setBusy(true)
    let captura: string | null = null
    if (file) {
      // La captura sube a tu carpeta del bucket `feedback` (por la API).
      try { captura = await uploadCaptura(file) }
      catch (e) { setBusy(false); return toast.error("No se pudo subir la imagen", { description: e instanceof Error ? e.message : undefined }) }
    }
    try {
      await sendFeedback({
        tipo, rating: tipo === "calificacion" ? rating : null, mensaje: mensaje.trim(), captura, household_id: household.id,
        pagina: conPagina ? pathname : null,
        contexto: feedbackContexto(),
      })
    } catch (e) { setBusy(false); return toast.error("No se pudo enviar", { description: (e as Error).message }) }
    setBusy(false)
    qc.invalidateQueries({ queryKey: ["feedback", user.id] })
    toast.success("¡Gracias! Recibimos tu opinión", { description: "Te avisamos aquí cuando la revisemos.", action: { label: "Ver", onClick: () => router.push("/opiniones") } })
    onDone()
  }

  return (
    <FieldGroup className="pb-2">
      <FormField label="¿Sobre qué nos quieres contar?" tip={false}>
        <ChoiceCards name="fb-tipo" value={tipo} onChange={(v) => setTipo(v as FeedbackTipo)} cols={compact ? 2 : 3}
          items={TIPO_FORM.map((k) => ({ value: k, label: TIPOS[k].label, desc: TIPOS[k].desc, icon: TIPOS[k].icon }))} />
      </FormField>
      {tipo === "calificacion" && (
        <div className="grid justify-items-center gap-1 rounded-xl bg-secondary/60 py-4">
          <p className="font-semibold">¿Qué tan útil es Mirai para ti?</p>
          <StarRating value={rating} onChange={setRating} size="lg" />
        </div>
      )}
      <FormField label={t.pregunta} htmlFor="fb-msg" required={tipo !== "calificacion"} tip={false}>
        <Textarea id="fb-msg" rows={4} maxLength={4000} placeholder={t.placeholder} value={mensaje} onChange={(e) => setMensaje(e.target.value)} aria-describedby="fb-msg-hint" />
        <p id="fb-msg-hint" className="flex justify-between gap-2 text-[12.5px] text-muted-foreground">
          <span>{tipo !== "calificacion" && falta ? falta : ""}</span><span className="tabular-nums">{mensaje.length.toLocaleString("es-CO")}/4.000</span>
        </p>
      </FormField>
      {(tipo === "error" || tipo === "sugerencia" || tipo === "funcion") && (
        <div className="grid gap-2">
          <input ref={input} type="file" accept="image/*" className="sr-only" aria-label="Adjuntar una captura" onChange={(e) => { pick(e.target.files?.[0]); e.target.value = "" }} />
          {file ? (
            <div className="flex items-center gap-3 rounded-lg bg-secondary/60 p-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={preview ?? ""} alt="Captura adjunta" className="size-14 rounded-md object-cover" />
              <p className="min-w-0 flex-1 truncate text-sm">{file.name}</p>
              <IconButton size="icon-sm" icon="x" label="Quitar la captura" onClick={() => setFile(null)} destructive />
            </div>
          ) : (
            <Button type="button" variant="outline" className="w-fit" onClick={() => input.current?.click()}><ImagePlus /> Adjuntar una captura (opcional)</Button>
          )}
        </div>
      )}
      <label className="flex items-start gap-3 rounded-lg bg-secondary/60 p-3 text-sm">
        <Switch checked={conPagina} onCheckedChange={setConPagina} aria-label="Incluir la página donde estás" className="mt-0.5" />
        <span className="min-w-0"><span className="block font-medium">Incluir la página donde estás</span><span className="block break-all text-xs text-muted-foreground">{pathname}</span></span>
      </label>
      <p className="text-xs text-muted-foreground">También incluimos la versión de Mirai y tu tipo de pantalla. Nunca enviamos tus montos ni tus datos financieros.</p>
      <div className="flex justify-end gap-2">
        <Button variant="outline" onClick={onDone}>Cancelar</Button>
        <SubmitButton disabled={!!falta} loading={busy} loadingText="Enviando…" onClick={send} hint={falta ?? undefined}><Send /> Enviar</SubmitButton>
      </div>
    </FieldGroup>
  )
}

/** "Tu opinión": calificar Mirai, reportar un error, pedir funciones o sugerir mejoras. Se abre con useShell().openFeedback(). */
export function FeedbackDialog() {
  const draft = useShell((s) => s.feedback)
  const close = useShell((s) => s.closeFeedback)
  return (
    <ResponsiveDialog open={!!draft} onOpenChange={(o) => !o && close()} title="Tu opinión sobre Mirai"
      description="Califícanos, cuéntanos qué falla o qué te gustaría. Lo leemos todo y te respondemos aquí.">
      {draft && <FeedbackForm key={JSON.stringify(draft)} draft={draft} onDone={close} />}
    </ResponsiveDialog>
  )
}
