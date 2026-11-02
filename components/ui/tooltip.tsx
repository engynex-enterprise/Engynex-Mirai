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

function TooltipContent({
  className,
  sideOffset = 0,
  children,
  ...props
}: React.ComponentProps<typeof TooltipPrimitive.Content>) {
  return (
    <TooltipPrimitive.Portal>
      <TooltipPrimitive.Content
        data-slot="tooltip-content"
        sideOffset={sideOffset}
        className={cn(
          "z-50 inline-flex w-fit max-w-xs origin-(--radix-tooltip-content-transform-origin) items-center gap-1.5 rounded-md bg-foreground px-3 py-1.5 text-xs text-background has-data-[slot=kbd]:pr-1.5 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 **:data-[slot=kbd]:relative **:data-[slot=kbd]:isolate **:data-[slot=kbd]:z-50 **:data-[slot=kbd]:rounded-sm data-[state=delayed-open]:animate-in data-[state=delayed-open]:fade-in-0 data-[state=delayed-open]:zoom-in-95 data-open:animate-in data-open:fade-in-0 data-open:zoom-in-95 data-closed:animate-out data-closed:fade-out-0 data-closed:zoom-out-95",
          className
        )}
        {...props}
      >
        {children}
        <TooltipPrimitive.Arrow className="z-50 size-2.5 translate-y-[calc(-50%_-_2px)] rotate-45 rounded-[2px] bg-foreground fill-foreground" />
      </TooltipPrimitive.Content>
    </TooltipPrimitive.Portal>
  )
}

export { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger }
