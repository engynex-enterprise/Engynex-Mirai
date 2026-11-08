"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { BrandLogo } from "@/components/mirai/brand-logo"
import { toast } from "@/components/mirai/toast"
import { abrirVentanaGoogle, escucharGoogle } from "./google-popup"

/**
 * Botón "Continuar con Google" con el logo oficial de Google (pautas de marca de Google Sign-In).
 * Google se abre en una ventana flotante y esta pestaña espera; al terminar entra a `next`, y si algo
 * falla la persona sigue aquí con el aviso. Si el navegador bloquea la ventana, se usa esta misma pestaña.
 */
export function GoogleButton({ next = "/inicio" }: { next?: string }) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [esperando, setEsperando] = useState(false)
  const ventana = useRef<Window | null>(null)
  const hecho = useRef(false)

  useEffect(() => {
    return escucharGoogle((m) => {
      if (hecho.current) return // llega por dos vías (canal y postMessage): una sola vez
      hecho.current = true
      setEsperando(false)
      if (m.ok) {
        setBusy(true)
        router.replace(next)
        router.refresh()
        return
      }
      hecho.current = false
      setBusy(false)
      toast.error("No pudimos entrar con Google", { description: "Intenta de nuevo o entra con tu correo." })
    })
  }, [next, router])

  async function conVentana() {
    hecho.current = false
    const v = abrirVentanaGoogle() // en el clic: si se abre después de esperar, el navegador la bloquea
    ventana.current = v
    setBusy(true)
    const r = await (await import("@/lib/auth/mirai")).googleAuthUrl()
    if (!r.ok) {
      v?.close()
      setBusy(false)
      toast.error("No pudimos abrir Google", { description: r.msg })
      return
    }
    if (!v || v.closed) {
      location.href = r.url // ventana bloqueada: Google en esta pestaña, como antes
      return
    }
    v.location.href = r.url
    setBusy(false)
    setEsperando(true)
  }

  return (
    <div className="grid gap-2">
      <Button type="button" variant="outline" size="lg" className="w-full" disabled={busy} onClick={() => conVentana()}>
        {busy || esperando ? <Spinner /> : <BrandLogo k="google" size={20} bare />}
        {esperando ? "Esperando a Google…" : "Continuar con Google"}
      </Button>
      {esperando && (
        <p className="text-center text-xs text-muted-foreground" role="status">
          Termina de entrar en la ventana de Google.{" "}
          <button type="button" className="font-medium text-brand hover:underline" onClick={() => { const v = ventana.current; if (v && !v.closed) v.focus(); else void conVentana() }}>
            ¿No la ves?
          </button>
          {" · "}
          <button type="button" className="font-medium text-brand hover:underline" onClick={() => { ventana.current?.close(); setEsperando(false) }}>
            Cancelar
          </button>
        </p>
      )}
    </div>
  )
}
