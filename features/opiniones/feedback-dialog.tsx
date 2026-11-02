"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { usePathname, useRouter } from "next/navigation"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { ImagePlus, Send, X } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { FieldGroup } from "@/components/ui/field"
import { Switch } from "@/components/ui/switch"
import { Spinner } from "@/components/ui/spinner"
import { Textarea } from "@/components/ui/textarea"
import { ChoiceCards } from "@/components/mirai/choice-cards"
import { FormField } from "@/components/mirai/field"
import { ResponsiveDialog } from "@/components/mirai/responsive-dialog"
import { useApp } from "@/components/app/app-context"
import { useShell, type FeedbackDraft } from "@/components/app/shell-store"
import { createClient } from "@/utils/supabase/client"
import { APP_VER } from "@/lib/content/ayuda"
import { TIPOS, TIPO_FORM, type FeedbackTipo } from "@/lib/content/opiniones"
import { StarRating } from "./stars"

const MAX_IMG = 5 * 1024 * 1024

/** Opiniones propias (Mis opiniones y la tarjeta de Inicio). */
export function useMyFeedback() {
  const { user } = useApp()
  return useQuery({
    queryKey: ["feedback", user.id],
    queryFn: async () => {
      const { data, error } = await createClient().from("feedback").select("*").eq("user_id", user.id).order("created_at", { ascending: false })
      if (error) throw new Error(error.message)
      return data
    },
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

  const send = async () => {
    if (tipo === "calificacion" && !rating) return toast.error("Elige de 1 a 5 estrellas")
    if (tipo !== "calificacion" && mensaje.trim().length < 3) return toast.error("Cuéntanos un poco más")
    setBusy(true)
    const sb = createClient()
    let captura: string | null = null
    if (file) {
      const path = `${user.id}/${crypto.randomUUID()}.${(file.name.split(".").pop() || "png").toLowerCase().replace(/[^a-z0-9]/g, "")}`
      const up = await sb.storage.from("feedback").upload(path, file, { contentType: file.type, upsert: false })
      if (up.error) { setBusy(false); return toast.error("No se pudo subir la imagen", { description: up.error.message }) }
      captura = path
    }
    const { error } = await sb.from("feedback").insert({
      tipo, rating: tipo === "calificacion" ? rating : null, mensaje: mensaje.trim(), captura, household_id: household.id,
      pagina: conPagina ? pathname : null,
      contexto: feedbackContexto(),
    })
    setBusy(false)
    if (error) return toast.error("No se pudo enviar", { description: error.message })
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
        <Textarea id="fb-msg" rows={4} maxLength={4000} placeholder={t.placeholder} value={mensaje} onChange={(e) => setMensaje(e.target.value)} />
      </FormField>
      {(tipo === "error" || tipo === "sugerencia" || tipo === "funcion") && (
        <div className="grid gap-2">
          <input ref={input} type="file" accept="image/*" className="sr-only" aria-label="Adjuntar una captura" onChange={(e) => { pick(e.target.files?.[0]); e.target.value = "" }} />
          {file ? (
            <div className="flex items-center gap-3 rounded-lg bg-secondary/60 p-2">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={preview ?? ""} alt="Captura adjunta" className="size-14 rounded-md object-cover" />
              <p className="min-w-0 flex-1 truncate text-sm">{file.name}</p>
              <Button size="icon-sm" variant="ghost" aria-label="Quitar la captura" onClick={() => setFile(null)}><X /></Button>
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
        <Button onClick={send} disabled={busy}>{busy ? <Spinner /> : <Send />} Enviar</Button>
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
