import Link from "next/link"
import { Button } from "@/components/ui/button"
import { Illustration } from "@/components/mirai/illustration"

export const metadata = { title: "No encontramos esta página" }

/** Página 404 con la ilustración de Mirai. */
export default function NotFound() {
  return (
    <main className="grid min-h-dvh place-items-center bg-background px-4">
      <div className="appear grid max-w-md justify-items-center gap-3 text-center">
        <Illustration k="no-encontrado" width={260} />
        <h1 className="text-2xl font-extrabold">No encontramos esta página</h1>
        <p className="text-muted-foreground">Puede que el enlace esté mal escrito o que la página ya no exista.</p>
        <div className="flex flex-wrap justify-center gap-2 pt-2">
          <Button asChild><Link href="/inicio">Ir al inicio</Link></Button>
          <Button variant="outline" asChild><Link href="/faq">Preguntas frecuentes</Link></Button>
        </div>
      </div>
    </main>
  )
}
