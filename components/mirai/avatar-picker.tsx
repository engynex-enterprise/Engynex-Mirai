"use client"

import { useRef, useState } from "react"
import { Check, ImageUp, Type } from "lucide-react"
import { toast } from "@/components/mirai/toast"
import { Spinner } from "@/components/ui/spinner"
import { BrandLogo } from "./brand-logo"
import { ResponsiveDialog } from "./responsive-dialog"
import { UserAvatar, initials } from "./user-avatar"
import { AVATARS, MIRAI_PREFIX } from "@/lib/content/avatars"
import { createClient } from "@/utils/supabase/client"
import { cn } from "@/lib/utils"

/** Reduce la foto a 512 px (webp) antes de subirla: carga rápido y ocupa poco. */
async function shrink(file: File): Promise<Blob> {
  const img = await createImageBitmap(file)
  const k = Math.min(1, 512 / Math.max(img.width, img.height))
  const c = document.createElement("canvas")
  c.width = Math.round(img.width * k); c.height = Math.round(img.height * k)
  c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height)
  return new Promise((ok, ko) => c.toBlob((b) => (b ? ok(b) : ko(new Error("No se pudo leer la imagen"))), "image/webp", 0.88))
}

function Tile({ selected, label, onClick, children }: { selected: boolean; label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" role="radio" aria-checked={selected} aria-label={label} onClick={onClick}
      className="group grid justify-items-center gap-2 rounded-xl p-1 text-center outline-none focus-visible:ring-2 focus-visible:ring-ring">
      <span className={cn("relative block size-[84px] rounded-[22%] transition-transform duration-200 group-hover:scale-[1.06] sm:size-24",
        selected ? "ring-4 ring-primary ring-offset-2 ring-offset-popover" : "group-hover:ring-4 group-hover:ring-foreground/70 group-hover:ring-offset-2 group-hover:ring-offset-popover")}>
        {children}
        {selected && <span className="absolute -right-1.5 -bottom-1.5 grid size-7 place-items-center rounded-full bg-primary text-primary-foreground ring-2 ring-popover"><Check className="size-4" /></span>}
      </span>
      <span className={cn("text-[13px] leading-tight", selected ? "font-semibold text-foreground" : "text-muted-foreground group-hover:text-foreground")}>{label}</span>
    </button>
  )
}

/**
 * Selector de avatar al estilo de los perfiles de Netflix: 10 avatares de Mirai, la foto de Google (si la hay),
 * subir una foto propia o quedarse con las iniciales. Devuelve "mirai:<clave>", una URL o null (iniciales).
 */
export function AvatarPicker({ open, onOpenChange, value, name, onPick, googlePhoto, uploadFor, title = "Elige tu avatar" }: {
  open: boolean; onOpenChange: (o: boolean) => void; value: string | null | undefined; name: string
  onPick: (v: string | null) => void; googlePhoto?: string | null; uploadFor?: string; title?: string
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const pick = (v: string | null) => { onPick(v); onOpenChange(false) }
  const custom = value && !value.startsWith(MIRAI_PREFIX) && value !== googlePhoto ? value : null

  const upload = async (f: File | undefined) => {
    if (!f || !uploadFor) return
    if (!f.type.startsWith("image/")) return toast.error("Elige una imagen (JPG, PNG o WebP)")
    setBusy(true)
    try {
      const blob = await shrink(f)
      const sb = createClient()
      const path = `${uploadFor}/${crypto.randomUUID()}.webp`
      const { error } = await sb.storage.from("avatars").upload(path, blob, { contentType: "image/webp", upsert: false })
      if (error) throw error
      pick(sb.storage.from("avatars").getPublicUrl(path).data.publicUrl)
    } catch (e) {
      toast.error("No se pudo subir la foto", { description: e instanceof Error ? e.message : undefined })
    } finally { setBusy(false) }
  }

  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange} wide title={title}
      description="Escoge cómo te ven en Mirai: un avatar, tu foto o tus iniciales. Lo puedes cambiar cuando quieras.">
      <div className="grid gap-6" role="radiogroup" aria-label={title}>
        <section className="grid gap-3">
          <h3 className="text-[15px] font-semibold">Avatares de Mirai</h3>
          <div className="grid grid-cols-3 gap-x-2 gap-y-4 min-[480px]:grid-cols-4 sm:grid-cols-5">
            {AVATARS.map((a) => (
              <Tile key={a.k} label={a.n} selected={value === MIRAI_PREFIX + a.k} onClick={() => pick(MIRAI_PREFIX + a.k)}>
                <UserAvatar src={MIRAI_PREFIX + a.k} name={name} square className="size-full" />
              </Tile>
            ))}
          </div>
        </section>
        <section className="grid gap-3">
          <h3 className="text-[15px] font-semibold">Tu foto o tus iniciales</h3>
          <div className="grid grid-cols-3 gap-x-2 gap-y-4 min-[480px]:grid-cols-4 sm:grid-cols-5">
            {googlePhoto && (
              <Tile label="Foto de Google" selected={value === googlePhoto} onClick={() => pick(googlePhoto)}>
                <UserAvatar src={googlePhoto} name={name} square className="size-full" fallbackClassName="text-2xl" />
                <span className="absolute -top-1.5 -left-1.5"><BrandLogo k="google" size={26} /></span>
              </Tile>
            )}
            {custom && (
              <Tile label="Tu foto" selected onClick={() => pick(custom)}>
                <UserAvatar src={custom} name={name} square className="size-full" fallbackClassName="text-2xl" />
              </Tile>
            )}
            {uploadFor && (
              <Tile label={busy ? "Subiendo…" : "Subir una foto"} selected={false} onClick={() => !busy && fileRef.current?.click()}>
                <span className="grid size-full place-items-center rounded-[22%] border-2 border-dashed border-muted-foreground/40 bg-secondary text-muted-foreground">
                  {busy ? <Spinner className="size-7" /> : <ImageUp className="size-8" />}
                </span>
              </Tile>
            )}
            <Tile label="Solo iniciales" selected={!value} onClick={() => pick(null)}>
              <span className="grid size-full place-items-center rounded-[22%] bg-brand-gradient text-2xl font-bold text-white">
                {initials(name) || <Type />}
              </span>
            </Tile>
          </div>
          {uploadFor && <input ref={fileRef} type="file" hidden accept="image/png,image/jpeg,image/webp,image/gif" onChange={(e) => { upload(e.target.files?.[0]); e.target.value = "" }} />}
        </section>
      </div>
    </ResponsiveDialog>
  )
}
