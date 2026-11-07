"use client"

// Regreso de Google en la ventana flotante (auth propio, v7). Avisa a la pestaña de Mirai que abrió la ventana y se
// cierra. Por BroadcastChannel (no por window.opener): Google aísla su página (COOP) y la ventana pierde el vínculo con
// quien la abrió. Si no era una ventana (el navegador la bloqueó y se usó esta misma pestaña), sigue como siempre:
// a /inicio o a /login con el aviso.
import { Suspense, useEffect } from "react"
import { useSearchParams } from "next/navigation"
import { IsoIcon } from "@/components/mirai/iso-icon"
import { GOOGLE_CANAL, GOOGLE_VENTANA, type GoogleMsg } from "@/components/auth/google-popup"

export default function GoogleRegreso() {
  return (
    <Suspense>
      <Regreso />
    </Suspense>
  )
}

function Regreso() {
  const q = useSearchParams()
  const ok = q.get("listo") === "1"
  const error = q.get("error") ?? undefined
  const estado = ok ? "listo" : "error"

  useEffect(() => {
    const msg: GoogleMsg = { type: "mirai:google", ok, error }
    try {
      const c = new BroadcastChannel(GOOGLE_CANAL)
      c.postMessage(msg)
      c.close()
    } catch { /* navegador sin BroadcastChannel: queda window.opener */ }
    try { window.opener?.postMessage(msg, location.origin) } catch { /* sin vínculo con la pestaña */ }
    let ventana = false
    try { ventana = sessionStorage.getItem(GOOGLE_VENTANA) === "1" || window.name === GOOGLE_VENTANA || !!window.opener } catch { ventana = !!window.opener }
    if (!ventana) {
      location.replace(ok ? "/inicio" : "/login?error=google")
      return
    }
    try { sessionStorage.removeItem(GOOGLE_VENTANA) } catch {}
    const t = setTimeout(() => window.close(), 400)
    return () => clearTimeout(t)
  }, [ok, error])

  return (
    <main className="grid min-h-dvh place-items-center bg-[linear-gradient(150deg,#1F2B4B,#253A57_55%,#2E5B33)] p-6 text-center text-white">
      <div className="grid max-w-xs justify-items-center gap-3" role="status">
        <IsoIcon k="mirai" size={56} />
        <p className="text-lg font-semibold">{estado === "error" ? "No pudimos entrar con Google" : "¡Listo!"}</p>
        <p className="text-sm text-white/75">
          {estado === "error" ? "Vuelve a Mirai e intenta de nuevo o entra con tu correo." : "Ya puedes volver a Mirai. Esta ventana se cierra sola."}
        </p>
        <button type="button" onClick={() => window.close()} className="mt-2 rounded-md bg-white/15 px-4 py-2 text-sm font-medium hover:bg-white/25">
          Cerrar esta ventana
        </button>
      </div>
    </main>
  )
}
