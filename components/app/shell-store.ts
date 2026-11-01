"use client"

import { create } from "zustand"

/** Estado de la interfaz del shell (paneles abiertos). */
type Shell = {
  search: boolean; setSearch: (v: boolean) => void
  add: boolean; setAdd: (v: boolean) => void
  bell: boolean; setBell: (v: boolean) => void
  newBook: boolean; setNewBook: (v: boolean) => void
  help: string | null; setHelp: (v: string | null) => void
  /** Chat del asesor: abierto y pregunta precargada (chatOpen con data-q de la v4). */
  chat: boolean; chatQ: string | null; openChat: (q?: string) => void; setChat: (v: boolean) => void
  /** Personas del hogar conectadas ahora (presencia de Realtime). */
  online: { id: string; nombre: string; avatar: string | null }[]; setOnline: (v: { id: string; nombre: string; avatar: string | null }[]) => void
}

export const useShell = create<Shell>((set) => ({
  search: false, setSearch: (search) => set({ search }),
  add: false, setAdd: (add) => set({ add }),
  bell: false, setBell: (bell) => set({ bell }),
  newBook: false, setNewBook: (newBook) => set({ newBook }),
  help: null, setHelp: (help) => set({ help }),
  online: [], setOnline: (online) => set({ online }),
  chat: false, chatQ: null, openChat: (q) => set({ chat: true, chatQ: q ?? null }), setChat: (chat) => set({ chat, ...(chat ? {} : { chatQ: null }) }),
}))
