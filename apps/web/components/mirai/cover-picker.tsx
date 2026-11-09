"use client"

import { useRef, useState } from "react"
import { Check, ImageUp, Trash2 } from "lucide-react"
import { toast } from "@/components/mirai/toast"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { uploadFile } from "@/lib/files/upload"
import { BANNER_THEMES, type BannerThemeKey } from "@/lib/content/banners"
import { ART_PREFIX, COVERS, COVER_CATS, COVER_COUNT, coverArt, coverColor, coverFoto, type CoverCat } from "@/lib/content/covers"
import { cn } from "@/lib/utils"
import { CoverArt, CoverScene } from "./cover-art"
import { ResponsiveDialog } from "./responsive-dialog"

/** Colores lisos de siempre (sin escena), por si alguien prefiere algo sobrio. */
const COLORES: [BannerThemeKey, string][] = [
  ["verde", "Verde"], ["menta", "Menta"], ["teal", "Turquesa"], ["cyan", "Cielo"], ["azul", "Azul"], ["navy", "Noche"],
  ["lavanda", "Lavanda"], ["morado", "Morado"], ["rosa", "Rosa"], ["naranja", "Naranja"], ["amarillo", "Sol"],
]

/** Reduce la foto a 1600 px de ancho (webp) antes de subirla: se ve bien y pesa poco. */
async function shrink(file: File): Promise<Blob> {
  const img = await createImageBitmap(file)
  const k = Math.min(1, 1600 / img.width)
  const c = document.createElement("canvas")
  c.width = Math.round(img.width * k); c.height = Math.round(img.height * k)
  c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height)
  return new Promise((ok, ko) => c.toBlob((b) => (b ? ok(b) : ko(new Error("No se pudo leer la imagen"))), "image/webp", 0.85))
}

type Tab = CoverCat | "colores" | "foto"

function Tile({ selected, label, onClick, children }: { selected: boolean; label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" role="radio" aria-checked={selected} aria-label={label} onClick={onClick}
      className="group grid min-w-0 gap-1.5 rounded-xl p-1 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring">
      <span className={cn("relative block aspect-[16/6] overflow-hidden rounded-xl transition-transform duration-200 group-hover:scale-[1.03]",
        selected ? "ring-4 ring-primary ring-offset-2 ring-offset-popover" : "ring-1 ring-black/5 group-hover:ring-2 group-hover:ring-foreground/50 dark:ring-white/10")}>
        {children}
        {selected && <span className="absolute right-1.5 bottom-1.5 grid size-7 place-items-center rounded-full bg-primary text-primary-foreground ring-2 ring-popover"><Check className="size-4" /></span>}
      </span>
      <span className={cn("truncate text-[13px] leading-tight", selected ? "font-semibold text-foreground" : "text-muted-foreground group-hover:text-foreground")}>{label}</span>
    </button>
  )
}

const GRID = "grid grid-cols-2 gap-x-3 gap-y-4 sm:grid-cols-3"

/**
 * Selector de portada del perfil: escenas por categoría (naturaleza, ciudad, viaje, tu plata, familia y figuras),
 * colores lisos y tu propia foto. Devuelve "art:<clave>", una clave de color o la URL de la foto subida.
 */
export function CoverPicker({ open, onOpenChange, value, onPick, uploadFor }: {
  open: boolean; onOpenChange: (o: boolean) => void; value: string | null | undefined
  onPick: (v: string) => void; uploadFor?: string
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const art = coverArt(value)
  const foto = coverFoto(value)
  const [tab, setTab] = useState<Tab>(foto ? "foto" : (art?.c ?? "naturaleza"))
  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) { setWasOpen(open); if (open) setTab(foto ? "foto" : (art?.c ?? "naturaleza")) }

  const pick = (v: string) => { onPick(v); onOpenChange(false) }

  const upload = async (f: File | undefined) => {
    if (!f || !uploadFor) return
    if (!f.type.startsWith("image/")) return toast.error("Elige una imagen (JPG, PNG o WebP)")
    setBusy(true)
    try {
      const blob = await shrink(f)
      const r = await uploadFile({ bucket: "avatars", body: blob, name: "portada.webp", type: "image/webp" })
      // La ruta es la misma cada vez: se le agrega la hora para que el navegador no muestre la foto anterior.
      if (r.publicUrl) pick(`${r.publicUrl}${r.publicUrl.includes("?") ? "&" : "?"}v=${Date.now()}`)
    } catch (e) {
      toast.error("No se pudo subir la foto", { description: e instanceof Error ? e.message : undefined })
    } finally { setBusy(false) }
  }

  const tabs: { id: Tab; label: string; n?: number }[] = [
    ...COVER_CATS.map((c) => ({ id: c.id as Tab, label: c.label, n: COVER_COUNT[c.id] })),
    { id: "colores", label: "Colores", n: COLORES.length },
    ...(uploadFor ? [{ id: "foto" as Tab, label: "Tu foto" }] : []),
  ]
  const lista = COVERS.filter((c) => c.c === tab)

  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange} wide title="Ponle una portada a tu perfil"
      description="La franja de arriba de tu perfil. Escoge un dibujo, un color o sube tu propia foto.">
      <div className="grid min-w-0 gap-4">
        <CoverArt value={value} className="h-28 w-full overflow-hidden rounded-xl sm:h-32" />

        <div role="tablist" aria-label="Categorías de portadas" className="no-scrollbar -mx-1 flex min-w-0 gap-2 overflow-x-auto px-1 py-0.5">
          {tabs.map((t) => (
            <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)}
              className={cn("inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-[14px] font-semibold whitespace-nowrap transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
                tab === t.id ? "bg-primary text-primary-foreground" : "bg-secondary text-foreground hover:bg-secondary-hover")}>
              {t.label}
              {t.n !== undefined && <span className={cn("rounded-full px-1.5 text-[12px] leading-5 tabular-nums", tab === t.id ? "bg-primary-foreground/20" : "bg-background/70 text-muted-foreground")}>{t.n}</span>}
            </button>
          ))}
        </div>

        {tab === "foto" ? (
          <section className="grid gap-3">
            <div className="grid gap-3 rounded-xl bg-secondary/50 p-4 sm:grid-cols-[1fr_auto] sm:items-center">
              <div className="grid gap-1">
                <p className="text-[15px] font-semibold">Sube tu propia foto</p>
                <p className="text-[13px] text-muted-foreground">Un paisaje, tu ciudad o una foto tuya. Se ve mejor si es horizontal (ancha). La guardamos en tu cuenta.</p>
              </div>
              <Button disabled={busy} onClick={() => fileRef.current?.click()} className="max-sm:w-full">{busy ? <Spinner /> : <ImageUp />} {busy ? "Subiendo…" : "Elegir una foto"}</Button>
            </div>
            {foto && (
              <div className="grid gap-3">
                <CoverArt value={foto} className="h-28 w-full overflow-hidden rounded-xl sm:h-32" />
                <Button variant="outline" className="w-fit text-danger" onClick={() => pick("verde")}><Trash2 /> Quitar mi foto</Button>
              </div>
            )}
          </section>
        ) : tab === "colores" ? (
          <div role="radiogroup" aria-label="Colores de portada" className={GRID}>
            {COLORES.map(([k, n]) => (
              <Tile key={k} label={n} selected={!art && !foto && coverColor(value) === k} onClick={() => pick(k)}>
                <span className="block size-full" style={{ background: `linear-gradient(135deg, ${BANNER_THEMES[k].c}, ${BANNER_THEMES[k].b})` }} />
              </Tile>
            ))}
          </div>
        ) : (
          <div role="radiogroup" aria-label={`Portadas de ${COVER_CATS.find((c) => c.id === tab)?.label}`} className={GRID}>
            {lista.map((c) => (
              <Tile key={c.k} label={c.n} selected={art?.k === c.k} onClick={() => pick(ART_PREFIX + c.k)}>
                <CoverScene motif={c.m} theme={c.t} className="size-full" />
              </Tile>
            ))}
          </div>
        )}
        {uploadFor && <input ref={fileRef} type="file" hidden accept="image/png,image/jpeg,image/webp" onChange={(e) => { upload(e.target.files?.[0]); e.target.value = "" }} />}
      </div>
    </ResponsiveDialog>
  )
}
