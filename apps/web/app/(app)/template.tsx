import { ViewTransition } from "react"

/**
 * Cambio de sección con un fundido corto, como una app nativa (View Transitions de React). La plantilla se vuelve a
 * montar en cada navegación entre secciones, así que la sección anterior sale y la nueva entra. Sin efecto si el
 * navegador no lo soporta o si la persona reduce las animaciones (app/globals.css › PWA).
 */
export default function Template({ children }: { children: React.ReactNode }) {
  return <ViewTransition enter="mirai-page-in" exit="mirai-page-out" default="none">{children}</ViewTransition>
}
