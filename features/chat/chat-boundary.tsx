"use client"

import { Component, type ReactNode } from "react"

/**
 * Límite de errores del chat (burbuja y ventana): si algo del chat falla, solo se oculta el chat y la página sigue
 * funcionando. Se vuelve a intentar al cambiar de página (`resetKey`).
 */
export class ChatBoundary extends Component<{ children: ReactNode; resetKey?: string }, { failed: boolean; key?: string }> {
  state = { failed: false, key: this.props.resetKey }
  static getDerivedStateFromProps(p: { resetKey?: string }, s: { failed: boolean; key?: string }) {
    return p.resetKey !== s.key ? { failed: false, key: p.resetKey } : null
  }
  static getDerivedStateFromError() { return { failed: true } }
  componentDidCatch(e: unknown) { console.warn("[Mirai] El chat tuvo un error y se ocultó:", e) }
  render() { return this.state.failed ? null : this.props.children }
}
