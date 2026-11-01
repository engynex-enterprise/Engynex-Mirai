"use client"

import { useEffect, useState } from "react"
import Link from "next/link"
import { Bug, RotateCcw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Illustration } from "@/components/mirai/illustration"
import { useShell } from "@/components/app/shell-store"

/** Error dentro de la app: explica qué pasó en palabras simples y permite reintentar. */
export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const [offline, setOffline] = useState(false)
  const report = useShell((s) => s.openFeedback)
  useEffect(() => { console.error(error); queueMicrotask(() => setOffline(typeof navigator !== "undefined" && !navigator.onLine)) }, [error])
  return (
    <div className="appear grid justify-items-center gap-3 py-16 text-center">
      <Illustration k={offline ? "sin-conexion" : "error"} width={240} />
      <h1 className="text-2xl font-extrabold">{offline ? "Estás sin conexión" : "Algo salió mal"}</h1>
      <p className="max-w-md text-muted-foreground">{offline ? "Revisa tu internet. Tus datos están guardados y se verán apenas vuelvas a conectarte." : "No pudimos mostrar esta sección. Intenta de nuevo; si sigue pasando, escríbenos."}</p>
      {error.digest && <p className="text-xs text-muted-foreground">Código: {error.digest}</p>}
      <div className="flex flex-wrap justify-center gap-2 pt-2">
        <Button onClick={reset}><RotateCcw /> Intentar de nuevo</Button>
        <Button variant="outline" asChild><Link href="/inicio">Ir al inicio</Link></Button>
        {!offline && <Button variant="ghost" onClick={() => report({ tipo: "error", mensaje: `La página mostró "Algo salió mal"${error.digest ? ` (código ${error.digest})` : ""}.\nEstaba intentando: ` })}><Bug /> Reportar este error</Button>}
      </div>
    </div>
  )
}
