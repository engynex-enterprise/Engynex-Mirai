"use client"

import { create } from "zustand"

/** Evento de Chrome/Edge para instalar la app (no existe en iPhone ni en Safari de Mac). */
export type BeforeInstallPromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: "accepted" | "dismissed" }> }

type Pwa = {
  /** Instalación disponible (Android y escritorio Chromium). */
  deferred: BeforeInstallPromptEvent | null
  /** Mirai está abierto como app instalada o se acaba de instalar. */
  installed: boolean
  /** Ventana "Instalar Mirai" (instrucciones de iPhone y otros navegadores). */
  dialog: boolean
  /** Hay una versión nueva: el service worker en espera, o "build" si solo cambió el despliegue. */
  update: ServiceWorker | "build" | null
  /** Archivos abiertos con Mirai desde el escritorio (file_handlers) para Importar. */
  files: File[]
  set: (p: Partial<Omit<Pwa, "set">>) => void
}

export const usePwa = create<Pwa>((set) => ({ deferred: null, installed: false, dialog: false, update: null, files: [], set: (p) => set(p) }))

/** Preferencia "no me vuelvas a mostrar el aviso de instalar" (solo en este navegador). */
export const INSTALL_DISMISS_KEY = "mirai-instalar-descartado"
