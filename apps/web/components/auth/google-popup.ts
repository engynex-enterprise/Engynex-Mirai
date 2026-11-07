"use client"

// "Continuar con Google" en una ventana flotante (auth propio, v7): la pestaña de Mirai no se va a ninguna parte y, si
// algo falla en Google, la persona sigue en la pantalla de entrada (antes quedaba atrapada en la página de Google, sin
// cómo volver). La ventana vuelve a /auth/google, que avisa por BroadcastChannel (Google aísla su página con COOP y la
// ventana pierde window.opener) y se cierra sola.

export const GOOGLE_CANAL = "mirai-google"
/** Nombre de la ventana y marca en su sessionStorage: /auth/google sabe que está en la ventana y no en la pestaña. */
export const GOOGLE_VENTANA = "mirai-google"
export type GoogleMsg = { type: "mirai:google"; ok: boolean; error?: string }

/** Abre la ventana centrada sobre Mirai, con "Abriendo Google…" mientras llega la dirección. null = la bloquearon. */
export function abrirVentanaGoogle(): Window | null {
  const w = 480, h = 640
  const left = Math.max(0, Math.round(window.screenX + (window.outerWidth - w) / 2))
  const top = Math.max(0, Math.round(window.screenY + (window.outerHeight - h) / 2.5))
  const v = window.open("", GOOGLE_VENTANA, `popup=yes,width=${w},height=${h},left=${left},top=${top}`)
  if (!v) return null
  try { v.sessionStorage.setItem(GOOGLE_VENTANA, "1") } catch { /* sin almacenamiento: /auth/google usa el nombre */ }
  try {
    v.document.title = "Entrar con Google · Mirai"
    v.document.body.style.cssText = "margin:0;min-height:100vh;display:grid;place-items:center;font-family:system-ui,sans-serif;background:linear-gradient(150deg,#1F2B4B,#253A57 55%,#2E5B33);color:#fff"
    v.document.body.textContent = "Abriendo Google…"
  } catch { /* la ventana ya navegó */ }
  return v
}

/** Escucha el regreso (BroadcastChannel y postMessage del mismo origen). Devuelve la función para dejar de escuchar. */
export function escucharGoogle(cb: (m: GoogleMsg) => void): () => void {
  const recibir = (d: unknown) => {
    if (d && typeof d === "object" && (d as GoogleMsg).type === "mirai:google") cb(d as GoogleMsg)
  }
  let canal: BroadcastChannel | null = null
  try {
    canal = new BroadcastChannel(GOOGLE_CANAL)
    canal.onmessage = (e) => recibir(e.data)
  } catch { /* navegador sin BroadcastChannel */ }
  const mensaje = (e: MessageEvent) => { if (e.origin === location.origin) recibir(e.data) }
  window.addEventListener("message", mensaje)
  return () => {
    canal?.close()
    window.removeEventListener("message", mensaje)
  }
}
