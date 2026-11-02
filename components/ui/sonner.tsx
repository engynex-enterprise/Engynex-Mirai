"use client"

import { useTheme } from "next-themes"
import { Toaster as Sonner, type ToasterProps } from "sonner"

/**
 * Contenedor de los toasts de Mirai (components/mirai/toast.tsx los dibuja al estilo de Facebook): abajo a la derecha,
 * encima del globo del chat (escritorio) y de la barra inferior + el globo (celular) para no taparlos.
 */
const Toaster = ({ ...props }: ToasterProps) => {
  const { theme = "system" } = useTheme()
  return (
    <Sonner
      theme={theme as ToasterProps["theme"]}
      className="toaster group"
      position="bottom-right"
      visibleToasts={4}
      gap={10}
      offset={{ bottom: 96, right: 24 }}
      mobileOffset={{ bottom: 148, left: 12, right: 12 }}
      {...props}
    />
  )
}

export { Toaster }
