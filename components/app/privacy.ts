"use client"

import { toast } from "sonner"

const KEY = "mirai-privado"

/** Modo privado: difumina los montos (los que llevan data-money) hasta pasar el mouse. */
export function applyPrivacy() {
  try { document.documentElement.classList.toggle("priv", localStorage.getItem(KEY) === "1") } catch {}
}

export function togglePrivacy() {
  const on = !document.documentElement.classList.contains("priv")
  document.documentElement.classList.toggle("priv", on)
  try { localStorage.setItem(KEY, on ? "1" : "0") } catch {}
  toast(on ? "Montos ocultos" : "Montos visibles", { description: on ? "Pasa el mouse sobre un valor para verlo." : undefined })
}
