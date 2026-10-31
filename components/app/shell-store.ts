"use client"

import { create } from "zustand"

/** Estado de la interfaz del shell (paneles abiertos). */
type Shell = {
  search: boolean; setSearch: (v: boolean) => void
  add: boolean; setAdd: (v: boolean) => void
  bell: boolean; setBell: (v: boolean) => void
  newBook: boolean; setNewBook: (v: boolean) => void
  help: string | null; setHelp: (v: string | null) => void
}

export const useShell = create<Shell>((set) => ({
  search: false, setSearch: (search) => set({ search }),
  add: false, setAdd: (add) => set({ add }),
  bell: false, setBell: (bell) => set({ bell }),
  newBook: false, setNewBook: (newBook) => set({ newBook }),
  help: null, setHelp: (help) => set({ help }),
}))
