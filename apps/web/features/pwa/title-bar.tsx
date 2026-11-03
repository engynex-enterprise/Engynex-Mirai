"use client"

import { useEffect, useState } from "react"
import { Search } from "lucide-react"
import { IsoIcon } from "@/components/mirai/iso-icon"

/** Evento para abrir el buscador (⌘K) desde fuera del shell (barra de título). Lo escucha components/app/app-shell.tsx. */
export const SEARCH_EVENT = "mirai:buscar"

/**
 * Bordes de la app instalada (app/layout.tsx):
 *  · iPhone/iPad: franja de la barra de estado (status-bar black-translucent deja el reloj en blanco sobre la app).
 *  · Escritorio con "Window Controls Overlay": barra de título propia, arrastrable, con el nombre de la página y el
 *    buscador; los botones de cerrar/minimizar del sistema quedan a un lado (titlebar-area-*).
 * Solo se ven en esos modos (CSS en app/globals.css › PWA).
 */
export function PwaChrome() {
  const [title, setTitle] = useState("Mirai")
  useEffect(() => {
    const read = () => setTitle(document.title.replace(/ · Mirai$/, "") || "Mirai")
    queueMicrotask(read)
    const mo = new MutationObserver(read)
    mo.observe(document.head, { childList: true, subtree: true, characterData: true })
    return () => mo.disconnect()
  }, [])
  return (
    <>
      <div className="pwa-statusbar" aria-hidden />
      <div className="pwa-titlebar" role="banner" aria-label="Barra de título de Mirai">
        <IsoIcon k="mirai" size={18} />
        <span className="font-semibold">Mirai</span>
        {title !== "Mirai" && <span className="truncate text-muted-foreground">· {title}</span>}
        <button type="button" className="pwa-no-drag ml-auto flex h-6 min-w-0 items-center gap-1.5 rounded-full bg-secondary px-3 text-xs text-muted-foreground hover:bg-secondary-hover"
          onClick={() => dispatchEvent(new Event(SEARCH_EVENT))} aria-label="Buscar en Mirai (Ctrl K)">
          <Search className="size-3.5" aria-hidden /> <span className="max-sm:hidden">Buscar en Mirai</span>
        </button>
      </div>
    </>
  )
}
