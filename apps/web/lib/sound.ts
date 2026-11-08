// Sonidos cortos y suaves cuando aparece un aviso (toasts y notificaciones de la campana), como las apps nativas.
// Se generan con Web Audio (sin archivos ni sonidos de terceros). Cada dispositivo decide si suenan: Ajustes › Alertas
// › "Sonido de los avisos" (localStorage, prendido por defecto). Los navegadores no dejan sonar nada hasta que la
// persona toca la página una vez: hasta entonces se omite en silencio.

export type Sound = "success" | "error" | "warning" | "info" | "message" | "bell"

/** Notas de cada sonido: [frecuencia en Hz, inicio en s, duración en s]. Volumen bajo para no asustar. */
export const SOUND_NOTES: Record<Sound, [number, number, number][]> = {
  success: [[880, 0, 0.12], [1318.5, 0.09, 0.2]], // La → Mi, sube: "listo"
  message: [[1046.5, 0, 0.18]], // un "ding" suave
  info: [[987.8, 0, 0.16], [1318.5, 0.11, 0.18]],
  warning: [[740, 0, 0.14], [740, 0.18, 0.16]], // dos toques iguales: "ojo"
  error: [[523.3, 0, 0.16], [392, 0.13, 0.24]], // baja: "algo falló"
  bell: [[1318.5, 0, 0.16], [1046.5, 0.12, 0.16], [1568, 0.24, 0.32]], // campanita de aviso nuevo
}

const KEY = "mirai-sonido"
const VOL = 0.07
/** Varios avisos seguidos (p. ej. tres emergentes al abrir) no se atropellan: uno cada 350 ms como máximo. */
export const SOUND_GAP_MS = 350

let ctx: AudioContext | null = null
let unlocked = false
let last = -Infinity
const subs = new Set<() => void>()

export function soundEnabled(): boolean {
  try { return localStorage.getItem(KEY) !== "0" } catch { return true }
}

export function setSoundEnabled(on: boolean) {
  try { localStorage.setItem(KEY, on ? "1" : "0") } catch { /* sin almacenamiento */ }
  subs.forEach((f) => f())
}

/** Para `useSyncExternalStore` (el interruptor de Ajustes se entera si cambia en otra pestaña). */
export function subscribeSound(f: () => void) {
  subs.add(f)
  const onStorage = (e: StorageEvent) => { if (e.key === KEY) f() }
  window.addEventListener("storage", onStorage)
  return () => { subs.delete(f); window.removeEventListener("storage", onStorage) }
}

function audio(): AudioContext | null {
  if (typeof window === "undefined") return null
  const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!AC) return null
  try { ctx ??= new AC() } catch { return null }
  return ctx
}

/** Prepara el audio con el primer toque o tecla (regla de los navegadores para reproducir sonido). */
export function unlockSoundOnGesture() {
  if (typeof window === "undefined" || unlocked) return
  const go = () => {
    const c = audio()
    if (!c) return
    void c.resume().then(() => { unlocked = true }).catch(() => undefined)
    window.removeEventListener("pointerdown", go, true)
    window.removeEventListener("keydown", go, true)
  }
  window.addEventListener("pointerdown", go, true)
  window.addEventListener("keydown", go, true)
}

/** Reproduce el sonido de un aviso. Devuelve `true` si sonó. `force` ignora la preferencia (botón "Probar"). */
export function playSound(kind: Sound, { force = false }: { force?: boolean } = {}): boolean {
  if (!force && !soundEnabled()) return false
  const now = typeof performance !== "undefined" ? performance.now() : Date.now()
  if (!force && now - last < SOUND_GAP_MS) return false
  const c = audio()
  if (!c || (c.state !== "running" && !unlocked && !force)) return false
  if (c.state === "suspended") void c.resume().catch(() => undefined)
  last = now
  try {
    const t0 = c.currentTime + 0.01
    const out = c.createGain()
    out.gain.value = VOL
    out.connect(c.destination)
    for (const [f, at, dur] of SOUND_NOTES[kind]) {
      const o = c.createOscillator()
      const g = c.createGain()
      o.type = "sine"
      o.frequency.value = f
      // Ataque corto y caída suave (sin "clic" al empezar ni al terminar).
      g.gain.setValueAtTime(0.0001, t0 + at)
      g.gain.exponentialRampToValueAtTime(1, t0 + at + 0.012)
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + at + dur)
      o.connect(g).connect(out)
      o.start(t0 + at)
      o.stop(t0 + at + dur + 0.02)
    }
    return true
  } catch {
    return false
  }
}

/** Solo para pruebas: olvida el estado del módulo. */
export function __resetSoundForTests() {
  ctx = null
  unlocked = false
  last = -Infinity
}
