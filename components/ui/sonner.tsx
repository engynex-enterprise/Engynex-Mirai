"use client"

import { useTheme } from "next-themes"
import { Toaster as Sonner, type ToasterProps } from "sonner"
import { useIsMobile } from "@/hooks/use-mobile"

/**
 * Contenedor de los toasts de Mirai (components/mirai/toast.tsx los dibuja al estilo de Facebook). Escritorio: abajo a
 * la izquierda, al lado del panel lateral (304 px) para no tapar el menú de usuario; celular: arriba, para no tapar la
 * barra inferior ni los botones del pie.
 */
const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme()
  const mobile = useIsMobile()
  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      position={mobile ? "top-center" : "bottom-left"}
      visibleToasts={4}
      gap={10}
      offset={{ bottom: 24, left: 304 }}
      mobileOffset={{ top: 12, left: 12, right: 12 }}
      {...props}
    />
  )
}

export { Toaster }
