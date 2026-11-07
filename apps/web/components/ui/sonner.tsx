"use client"

import { useTheme } from "next-themes"
import { Toaster as Sonner, type ToasterProps } from "sonner"
import { useIsMobile } from "@/hooks/use-mobile"

/**
 * Contenedor de los toasts de Mirai (components/mirai/toast.tsx los dibuja al estilo de Facebook): arriba a la derecha
 * (lejos del globo del chat y de la barra inferior del celular). En el celular, arriba y a lo ancho, debajo de la
 * muesca de la pantalla (safe-area).
 */
const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme()
  const mobile = useIsMobile()
  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      position="top-right"
      // Uno debajo del otro (no apilados): un aviso nuevo no tapa el "Deshacer" del anterior, sobre todo en el celular.
      expand
      visibleToasts={mobile ? 2 : 3}
      gap={10}
      offset={{ top: 16, right: 24 }}
      mobileOffset={{ top: "calc(env(safe-area-inset-top) + 12px)", left: 12, right: 12 }}
      {...props}
    />
  )
}

export { Toaster }
