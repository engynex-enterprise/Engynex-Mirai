"use client"

import { useEffect, useMemo, useRef, useState } from "react"
import { uploadFile } from "@/lib/files/upload"
import { Check, ImageUp, Search, Shuffle, Type, X } from "lucide-react"
import { toast } from "@/components/mirai/toast"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Spinner } from "@/components/ui/spinner"
import { BrandLogo } from "./brand-logo"
import { ResponsiveDialog } from "./responsive-dialog"
import { UserAvatar, initials } from "./user-avatar"
import { AVATARS, AVATAR_CATS, AVATAR_COUNT, MIRAI_PREFIX, miraiAvatar, type AvatarCat } from "@/lib/content/avatars"
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

/** Sin tildes y en minúscula, para buscar "buho" y encontrar "Búho". */
const norm = (s: string) => s.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().trim()
const CAT_LABEL = Object.fromEntries(AVATAR_CATS.map((c) => [c.id, c.label])) as Record<AvatarCat, string>
type Tab = AvatarCat | "todos"

function Tile({ selected, label, onClick, children }: { selected: boolean; label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" role="radio" aria-checked={selected} aria-label={label} onClick={onClick}
      className="group grid min-w-0 justify-items-center gap-2 rounded-xl p-1 text-center outline-none focus-visible:ring-2 focus-visible:ring-ring">
      <span className={cn("relative block size-[72px] rounded-[22%] transition-transform duration-200 group-hover:scale-[1.06] min-[420px]:size-[84px] sm:size-24",
        selected ? "ring-4 ring-primary ring-offset-2 ring-offset-popover" : "group-hover:ring-4 group-hover:ring-foreground/70 group-hover:ring-offset-2 group-hover:ring-offset-popover")}>
        {children}
        {selected && <span className="absolute -right-1.5 -bottom-1.5 grid size-7 place-items-center rounded-full bg-primary text-primary-foreground ring-2 ring-popover"><Check className="size-4" /></span>}
      </span>
      <span className={cn("w-full text-[13px] leading-tight break-words", selected ? "font-semibold text-foreground" : "text-muted-foreground group-hover:text-foreground")}>{label}</span>
    </button>
  )
}

const GRID = "grid grid-cols-4 gap-x-1 gap-y-4 min-[420px]:gap-x-2 sm:grid-cols-5 md:grid-cols-6"

/**
 * Selector de avatar al estilo de los perfiles de Netflix: avatares de Mirai por categorías (con búsqueda y "Al azar"),
 * la foto de Google (si la hay), subir una foto propia o quedarse con las iniciales. Devuelve "mirai:<clave>", una URL o null (iniciales).
 */
export function AvatarPicker({ open, onOpenChange, value, name, onPick, googlePhoto, uploadFor, title = "Elige tu avatar" }: {
  open: boolean; onOpenChange: (o: boolean) => void; value: string | null | undefined; name: string
  onPick: (v: string | null) => void; googlePhoto?: string | null; uploadFor?: string; title?: string
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const tabsRef = useRef<HTMLDivElement>(null)
  const [busy, setBusy] = useState(false)
  const current = miraiAvatar(value)
  const [tab, setTab] = useState<Tab>(current?.c ?? "financiero")
  const [q, setQ] = useState("")
  // Al abrir: la categoría del avatar actual y la búsqueda limpia.
  const [wasOpen, setWasOpen] = useState(open)
  if (open !== wasOpen) {
    setWasOpen(open)
    if (open) { setTab(current?.c ?? "financiero"); setQ("") }
  }

  const pick = (v: string | null) => { onPick(v); onOpenChange(false) }
  const custom = value && !value.startsWith(MIRAI_PREFIX) && value !== googlePhoto ? value : null

  const query = norm(q)
  const list = useMemo(
    () => (query ? AVATARS.filter((a) => norm(a.n).includes(query) || norm(CAT_LABEL[a.c]).includes(query)) : tab === "todos" ? AVATARS : AVATARS.filter((a) => a.c === tab)),
    [query, tab],
  )

  // La pestaña activa siempre a la vista (en celular las pestañas se desplazan de lado).
  useEffect(() => {
    if (!open) return
    const id = requestAnimationFrame(() => {
      const box = tabsRef.current, el = box?.querySelector<HTMLElement>('[aria-selected="true"]')
      if (box && el) box.scrollTo({ left: el.offsetLeft - box.clientWidth / 2 + el.clientWidth / 2, behavior: "smooth" })
    })
    return () => cancelAnimationFrame(id)
  }, [tab, open])

  const random = () => {
    const pool = (list.length > 1 ? list : AVATARS).filter((a) => MIRAI_PREFIX + a.k !== value)
    const a = pool[Math.floor(Math.random() * pool.length)]
    if (a) pick(MIRAI_PREFIX + a.k)
  }

  const upload = async (f: File | undefined) => {
    if (!f || !uploadFor) return
    if (!f.type.startsWith("image/")) return toast.error("Elige una imagen (JPG, PNG o WebP)")
    setBusy(true)
    try {
      const blob = await shrink(f)
      // Sube por la API (la ruta {tu id}/… la arma el servidor).
      const r = await uploadFile({ bucket: "avatars", body: blob, name: "avatar.webp", type: "image/webp" })
      if (r.publicUrl) pick(r.publicUrl)
    } catch (e) {
      toast.error("No se pudo subir la foto", { description: e instanceof Error ? e.message : undefined })
    } finally { setBusy(false) }
  }

  const tabs: { id: Tab; label: string; n: number }[] = [
    ...AVATAR_CATS.map((c) => ({ id: c.id, label: c.label, n: AVATAR_COUNT[c.id] })),
    { id: "todos", label: "Todos", n: AVATARS.length },
  ]

  return (
    <ResponsiveDialog open={open} onOpenChange={onOpenChange} wide title={title}
      description="Escoge cómo te ven en Mirai: un avatar, tu foto o tus iniciales. Lo puedes cambiar cuando quieras.">
      <div className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-6">
        <section className="grid min-w-0 gap-3" aria-labelledby="av-picker-h">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 id="av-picker-h" className="text-[15px] font-semibold">Avatares de Mirai <span className="font-normal text-muted-foreground">· {AVATARS.length}</span></h3>
            <Button type="button" variant="outline" size="sm" onClick={random}><Shuffle /> Al azar</Button>
          </div>

          <div className="sticky top-0 z-10 grid min-w-0 gap-2 bg-popover pt-1 pb-2">
            <div className="relative">
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar: perro, arepa, abuela…"
                aria-label="Buscar avatar" className="h-10 rounded-full pr-9 pl-9 [&::-webkit-search-cancel-button]:hidden" />
              {q && (
                <button type="button" onClick={() => setQ("")} aria-label="Borrar búsqueda"
                  className="absolute top-1/2 right-2 grid size-7 -translate-y-1/2 place-items-center rounded-full text-muted-foreground hover:bg-secondary">
                  <X className="size-4" />
                </button>
              )}
            </div>
            {!query && (
              <div ref={tabsRef} role="tablist" aria-label="Categorías de avatares" className="no-scrollbar -mx-1 flex min-w-0 gap-2 overflow-x-auto px-1 py-0.5">
                {tabs.map((t) => (
                  <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} aria-controls="av-picker-grid" onClick={() => setTab(t.id)}
                    className={cn("inline-flex h-9 shrink-0 items-center gap-1.5 rounded-full px-3.5 text-[14px] font-semibold whitespace-nowrap transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      tab === t.id ? "bg-primary text-primary-foreground" : "bg-secondary text-foreground hover:bg-secondary-hover")}>
                    {t.label}
                    <span className={cn("rounded-full px-1.5 text-[12px] leading-5 tabular-nums", tab === t.id ? "bg-primary-foreground/20" : "bg-background/70 text-muted-foreground")}>{t.n}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {query && (
            <p className="text-[13px] text-muted-foreground" aria-live="polite">
              {list.length ? `${list.length} ${list.length === 1 ? "avatar" : "avatares"} para «${q.trim()}»` : `No encontramos avatares para «${q.trim()}». Prueba con otra palabra o mira las categorías.`}
            </p>
          )}
          <div id="av-picker-grid" role="radiogroup" aria-label={query ? "Resultados de la búsqueda" : `Avatares: ${tab === "todos" ? "todos" : CAT_LABEL[tab]}`} className={GRID}>
            {list.map((a) => (
              <Tile key={a.k} label={a.n} selected={value === MIRAI_PREFIX + a.k} onClick={() => pick(MIRAI_PREFIX + a.k)}>
                <UserAvatar src={MIRAI_PREFIX + a.k} name={name} square className="size-full" />
              </Tile>
            ))}
          </div>
        </section>

        <section className="grid min-w-0 gap-3">
          <h3 id="av-picker-own" className="text-[15px] font-semibold">Tu foto o tus iniciales</h3>
          <div role="radiogroup" aria-labelledby="av-picker-own" className={GRID}>
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
