"use client"

import { CircleHelp } from "lucide-react"
import { Button } from "@/components/ui/button"
import { BannerArt } from "./banner-art"
import { hasIso } from "./iso-icon"
import { useShell } from "@/components/app/shell-store"
import { HELP } from "@/lib/content/help"
import { bannerFor } from "@/lib/content/banners"
import Link from "next/link"
import { PAGE_TABS, crumbsFor, pageById } from "@/lib/nav"
import { cn } from "@/lib/utils"
import { Crumbs } from "./crumbs"
import { Icon } from "./icon"

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
  const tabs = PAGE_TABS[id]
  return (
    <>
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
                <Button variant="outline" className="bg-white/75 hover:bg-white dark:bg-white/10 dark:hover:bg-white/15" onClick={() => setHelp(id)} title="Abre el Centro de ayuda con el paso a paso de esta pantalla">
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
    {tabs && <PageTabs current={id} tabs={tabs} />}
    </>
  )
}

/**
 * Pestañas de una página que agrupa varias (p. ej. Gastos: del día a día y fijos). Cada pestaña es su propia ruta, así
 * que los enlaces, ⌘K y el botón Atrás del navegador siguen funcionando.
 */
function PageTabs({ current, tabs }: { current: string; tabs: { id: string; label: string; icon: string; desc: string }[] }) {
  return (
    <nav aria-label="Secciones" className="appear -mt-2 grid auto-cols-fr grid-flow-col gap-1 rounded-xl bg-card p-1 shadow-card ring-1 ring-black/5 sm:flex sm:w-fit sm:max-w-full dark:ring-white/10">
      {tabs.map((t) => {
        const on = t.id === current
        return (
          <Link key={t.id} href={`/${t.id}`} aria-current={on ? "page" : undefined}
            className={cn("group flex min-w-0 items-center gap-2.5 rounded-lg px-2.5 py-2 transition-colors max-sm:flex-col max-sm:gap-1 max-sm:text-center sm:max-w-60 sm:min-w-0 sm:flex-1 sm:px-3",
              on ? "bg-brand-soft text-foreground ring-1 ring-brand/30" : "text-muted-foreground hover:bg-secondary hover:text-foreground")}>
            <span className={cn("grid size-8 shrink-0 place-items-center rounded-full", on ? "bg-primary text-primary-foreground" : "bg-secondary text-muted-foreground group-hover:text-foreground")}><Icon name={t.icon} className="size-4" /></span>
            <span className="grid min-w-0 sm:text-left">
              <span className={cn("truncate text-[13px] font-semibold sm:text-[14px]", on && "text-foreground")}>{t.label}</span>
              <span className="truncate text-[11.5px] leading-4 text-muted-foreground max-sm:hidden">{t.desc}</span>
            </span>
          </Link>
        )
      })}
    </nav>
  )
}
