"use client"

import { useEffect, useRef } from "react"
import { useChat } from "./store"

/** Empieza una conversación nueva y pone el foco en la caja de texto. */
export function newChat() {
  useChat.getState().setThread(null)
  useChat.getState().setDraft("")
  setTimeout(() => document.querySelector<HTMLTextAreaElement>('textarea[aria-label="Escribe tu pregunta"]')?.focus(), 60)
}

/**
 * Atajos del chat (lib/content/centro-ayuda.ts › ATAJOS):
 * - Ctrl/⌘ + Shift + O: nueva conversación (en /consejero y con la burbuja abierta).
 * - Ctrl/⌘ + K en /consejero: busca en tus conversaciones. Decisión: el ⌘K global (buscar en Mirai) sigue disponible
 *   presionándolo otra vez con la búsqueda del historial ya enfocada, o desde "Buscar en Mirai" del menú.
 * Se escuchan en fase de captura para adelantarse al atajo global del shell.
 */
export function useChatHotkeys({ enabled, onSearch }: { enabled: boolean; onSearch?: () => void }) {
  const search = useRef(onSearch)
  useEffect(() => { search.current = onSearch }, [onSearch])
  useEffect(() => {
    if (!enabled) return
    const k = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey
      const key = e.key.toLowerCase()
      if (mod && e.shiftKey && key === "o") { e.preventDefault(); e.stopImmediatePropagation(); newChat() }
      else if (search.current && mod && !e.shiftKey && !e.altKey && key === "k") {
        if ((document.activeElement as HTMLElement | null)?.hasAttribute("data-chat-search")) return
        e.preventDefault(); e.stopImmediatePropagation(); search.current()
      }
    }
    window.addEventListener("keydown", k, { capture: true })
    return () => window.removeEventListener("keydown", k, { capture: true })
  }, [enabled])
}
