"use client"

import * as React from "react"
import { cn } from "@/lib/utils"
import { Tooltip as TooltipPrimitive } from "radix-ui"

function TooltipProvider({
  delayDuration = 0,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Provider>) {
  return (
    <TooltipPrimitive.Provider
      data-slot="tooltip-provider"
      delayDuration={delayDuration}
      {...props}
    />
  )
}

/*
 * Ajuste Mirai: Radix no abre los tooltips con el dedo (ignora el puntero táctil y cierra al tocar). En pantallas
 * táctiles un toque abre o cierra el tooltip; en los enlaces (menú lateral) se deja el comportamiento normal.
 */
const TouchTooltip = React.createContext<{ open: boolean; set: (o: boolean) => void } | null>(null)

function Tooltip({
  open: openProp,
  defaultOpen,
  onOpenChange,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Root>) {
  const [inner, setInner] = React.useState(defaultOpen ?? false)
  const open = openProp ?? inner
  const set = React.useCallback((o: boolean) => { if (openProp === undefined) setInner(o); onOpenChange?.(o) }, [openProp, onOpenChange])
  return (
    <TouchTooltip.Provider value={{ open, set }}>
      <TooltipPrimitive.Root data-slot="tooltip" open={open} onOpenChange={set} {...props} />
    </TouchTooltip.Provider>
  )
}

function TooltipTrigger({
  onPointerDown,
  onClick,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Trigger>) {
  const ctx = React.useContext(TouchTooltip)
  const touch = React.useRef<{ on: boolean; was: boolean }>({ on: false, was: false })
  return (
    <TooltipPrimitive.Trigger
      data-slot="tooltip-trigger"
      onPointerDown={(e) => { touch.current = { on: e.pointerType !== "mouse", was: !!ctx?.open }; onPointerDown?.(e) }}
      onClick={(e) => {
        onClick?.(e)
        const t = touch.current
        touch.current = { on: false, was: false }
        // Radix cierra el tooltip después de este clic; se vuelve a abrir (o se deja cerrado) en el siguiente ciclo.
        if (t.on && ctx && !e.currentTarget.closest("a")) setTimeout(() => ctx.set(!t.was), 0)
      }}
      {...props}
    />
  )
}

/*
 * Flecha de verdad (triángulo con la punta redondeada), del mismo color que la burbuja.
 * Antes era un cuadrado girado 45°: cuando el tooltip cambiaba de color se veía el rombo completo encima.
 * El viewBox propio manda sobre el de Radix (los props del hijo ganan en <Slot>); se sube 1px para que no
 * quede una línea entre la burbuja y la flecha.
 */
function TooltipArrow() {
  return (
    <TooltipPrimitive.Arrow asChild width={14} height={7}>
      <svg viewBox="0 0 14 7" preserveAspectRatio="none" aria-hidden className="-translate-y-px fill-tooltip">
        <path d="M0 0h14L8.06 5.94a1.5 1.5 0 0 1-2.12 0Z" />
      </svg>
    </TooltipPrimitive.Arrow>
  )
}

function TooltipContent({
  className,
  sideOffset = 6,
  collisionPadding = 8,
  children,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Content>) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        data-slot="tooltip-content"
        sideOffset={sideOffset}
        collisionPadding={collisionPadding}
        className={cn(
          "z-50 inline-flex w-fit max-w-xs origin-(--radix-tooltip-content-transform-origin) items-center gap-1.5 rounded-lg bg-tooltip px-3 py-1.5 text-xs leading-relaxed text-pretty text-tooltip-foreground drop-shadow-[0_2px_8px_rgba(0,0,0,0.22)] has-data-[slot=kbd]:pr-1.5 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 **:data-[slot=kbd]:rounded-sm data-[state=delayed-open]:animate-in data-[state=delayed-open]:fade-in-0 data-[state=delayed-open]:zoom-in-95 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
          className
        )}
        {...props}
      >
        {children}
        <TooltipArrow />
      </TooltipPrimitive.Content>
    </TooltipPrimitive.Portal>
  )
}

export { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger }
