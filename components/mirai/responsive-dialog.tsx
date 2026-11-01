"use client"

import { useState, useSyncExternalStore } from "react"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Drawer, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle } from "@/components/ui/drawer"
import { useIsMobile } from "@/hooks/use-mobile"
import { MDESC } from "@/lib/content/help"
import { cn } from "@/lib/utils"

/**
 * Ventana de formulario: Dialog en escritorio, panel inferior (vaul) en celular.
 * La descripción sale de MDESC[mdesc] si no se pasa una propia.
 * El modo (Dialog o panel) queda fijo mientras está abierta: si la pantalla cruza los 768 px (girar el celular,
 * cambiar el tamaño de la ventana) el formulario no se vuelve a montar ni pierde lo que ya se escribió.
 */
const noop = () => () => {}

export function ResponsiveDialog({
  open, onOpenChange, title, description, mdesc, footer, children, wide,
}: {
  open: boolean; onOpenChange: (o: boolean) => void; title: string; description?: string; mdesc?: string
  footer?: React.ReactNode; children: React.ReactNode; wide?: boolean
}) {
  const live = useIsMobile()
  const hydrated = useSyncExternalStore(noop, () => true, () => false)
  const [lock, setLock] = useState<boolean | null>(null)
  const fix = open && hydrated
  if (fix && lock === null) setLock(live)
  if (!fix && lock !== null) setLock(null)
  const mobile = lock ?? live
  const desc = description ?? (mdesc ? MDESC[mdesc] : undefined)
  if (mobile)
    return (
      <Drawer open={open} onOpenChange={onOpenChange} repositionInputs={false}>
        <DrawerContent className="max-h-[94dvh]">
          <DrawerHeader className="border-b text-center">
            <DrawerTitle className="text-[20px] font-bold">{title}</DrawerTitle>
            {desc && <DrawerDescription className="text-[14px]">{desc}</DrawerDescription>}
          </DrawerHeader>
          <div className="overflow-y-auto px-4 pt-4 pb-2">{children}</div>
          {footer && <DrawerFooter className="pb-safe grid grid-cols-2 border-t">{footer}</DrawerFooter>}
        </DrawerContent>
      </Drawer>
    )
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn("flex max-h-[92dvh] flex-col gap-0 p-0", wide ? "sm:max-w-[820px]" : "sm:max-w-[700px]")}>
        {/* Encabezado estilo Facebook: título centrado, línea divisoria y cerrar en círculo gris */}
        <DialogHeader className="items-center border-b px-14 pt-4 pb-3 text-center">
          <DialogTitle className="text-[20px] leading-6 font-bold">{title}</DialogTitle>
          {desc && <DialogDescription className="max-w-[60ch] text-center text-[14px]">{desc}</DialogDescription>}
        </DialogHeader>
        <div className="overflow-y-auto px-6 pt-5 pb-6">{children}</div>
        {footer && <DialogFooter className="border-t px-6 py-3">{footer}</DialogFooter>}
      </DialogContent>
    </Dialog>
  )
}
