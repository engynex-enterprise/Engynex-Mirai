"use client"

import { CircleHelp } from "lucide-react"
import { Button } from "@/components/ui/button"
import { BannerArt } from "./banner-art"
import { hasIso } from "./iso-icon"
import { useShell } from "@/components/app/shell-store"
import { HELP } from "@/lib/content/help"
import { bannerFor } from "@/lib/content/banners"
import { crumbsFor, pageById } from "@/lib/nav"
import { Crumbs } from "./crumbs"

/**
 * Banner de cada módulo: fondo con el degradado de su familia de color, texto a la izquierda (sección, título,
 * descripción y acciones) y a la derecha una escena vectorial relacionada con el módulo y su isotipo.
 * `children` va debajo de las acciones (p. ej. el avance de la puesta en marcha en Inicio).
 */
export function PageHeader({ id, title, description, actions, noHelp, children }: {
  id: string; title?: string; description?: string; actions?: React.ReactNode; noHelp?: boolean; children?: React.ReactNode
}) {
  const setHelp = useShell((s) => s.setHelp)
  const help = HELP[id]
  const { theme, motif } = bannerFor(id)
  const page = pageById(id)
  const crumbs = crumbsFor(id)
  const iso = hasIso(id) ? id : page?.group?.iso ?? "mirai"
  return (
    <header
      className="banner-bg appear relative overflow-hidden rounded-[24px] sm:rounded-[28px]"
      style={{ "--bn-bg": theme.bg, "--bn-dark": theme.dark } as React.CSSProperties}
    >
      <div className="grid items-center md:grid-cols-[minmax(0,1fr)_minmax(260px,400px)]">
        <div className="order-2 grid justify-items-start gap-3 px-5 pb-6 sm:px-8 md:order-1 md:py-9 md:pr-2 md:pl-10">
          <Crumbs items={crumbs} />
          <h1 className="font-heading text-[28px] leading-[1.12] font-semibold tracking-[-0.02em] text-meta-text sm:text-[38px]">{title ?? help?.t}</h1>
          {(description ?? help?.i) && <p className="max-w-[60ch] text-[15px] leading-relaxed text-meta-text/85 sm:text-[16px]">{description ?? help?.i}</p>}
          {(actions || (help && !noHelp)) && (
            <div className="flex flex-wrap items-center gap-2 pt-1 max-sm:w-full max-sm:[&>*]:flex-1">
              {help && !noHelp && (
                <Button variant="outline" className="bg-white/75 hover:bg-white dark:bg-white/10 dark:hover:bg-white/15" onClick={() => setHelp(id)}>
                  <CircleHelp /> Cómo funciona
                </Button>
              )}
              {actions}
            </div>
          )}
          {children}
        </div>
        <BannerArt id={id} iso={iso} theme={theme} motif={motif} className="order-1 mx-auto h-[150px] w-auto max-w-full pt-3 sm:h-[180px] md:order-2 md:h-[236px] md:pt-0 md:pr-4" />
      </div>
    </header>
  )
}
