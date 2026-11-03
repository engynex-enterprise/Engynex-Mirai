// Vibración suave en acciones clave (guardar, error, refrescar), como las apps nativas. Solo en pantallas táctiles con
// vibración (Android; iPhone no la permite en la web) y nunca si la persona pidió reducir animaciones.

export type Haptic = "light" | "success" | "warning" | "error"

export const HAPTIC_PATTERNS: Record<Haptic, number | number[]> = {
  light: 8,
  success: [10, 40, 14],
  warning: [24, 50, 24],
  error: [30, 60, 30, 60, 30],
}

export function haptic(kind: Haptic = "light") {
  if (typeof navigator === "undefined" || typeof navigator.vibrate !== "function" || typeof window === "undefined") return
  try {
    if (document.documentElement.classList.contains("rm")) return
    if (matchMedia("(prefers-reduced-motion: reduce)").matches || !matchMedia("(pointer: coarse)").matches) return
    navigator.vibrate(HAPTIC_PATTERNS[kind])
  } catch { /* sin vibración */ }
}
