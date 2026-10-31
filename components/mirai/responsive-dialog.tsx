"use client"

import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Drawer, DrawerContent, DrawerDescription, DrawerFooter, DrawerHeader, DrawerTitle } from "@/components/ui/drawer"
import { useIsMobile } from "@/hooks/use-mobile"
import { MDESC } from "@/lib/content/help"
import { cn } from "@/lib/utils"

/**
 * Ventana de formulario: Dialog en escritorio, panel inferior (vaul) en celular.
 * La descripción sale de MDESC[mdesc] si no se pasa una propia.
 */
export function ResponsiveDialog({
  open, onOpenChange, title, description, mdesc, footer, children, wide,
}: {
  open: boolean; onOpenChange: (o: boolean) => void; title: string; description?: string; mdesc?: string
  footer?: React.ReactNode; children: React.ReactNode; wide?: boolean
}) {
  const mobile = useIsMobile()
  const desc = description ?? (mdesc ? MDESC[mdesc] : undefined)
  if (mobile)
    return (
      <Drawer open={open} onOpenChange={onOpenChange} repositionInputs={false}>
        <DrawerContent className="max-h-[94dvh]">
          <DrawerHeader className="text-left">
            <DrawerTitle className="text-lg">{title}</DrawerTitle>
            {desc && <DrawerDescription>{desc}</DrawerDescription>}
          </DrawerHeader>
          <div className="overflow-y-auto px-4 pb-2">{children}</div>
          {footer && <DrawerFooter className="pb-safe grid grid-cols-2 border-t">{footer}</DrawerFooter>}
        </DrawerContent>
      </Drawer>
    )
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className={cn("flex max-h-[92dvh] flex-col gap-0 p-0", wide ? "sm:max-w-[820px]" : "sm:max-w-[700px]")}>
        <DialogHeader className="px-7 pt-6 pb-4">
          <DialogTitle className="text-xl">{title}</DialogTitle>
          {desc && <DialogDescription className="max-w-[60ch]">{desc}</DialogDescription>}
        </DialogHeader>
        <div className="overflow-y-auto px-7 pb-6">{children}</div>
        {footer && <DialogFooter className="border-t px-7 py-4">{footer}</DialogFooter>}
      </DialogContent>
    </Dialog>
  )
}
