"use client"

import { useQueryClient } from "@tanstack/react-query"
import { useQuery } from "@/lib/query"
import { useApp } from "@/components/app/app-context"
import { loadAccount } from "./api"

export const accountKey = (userId: string) => ["account", userId] as const

/** Estado de "Tu cuenta" (formas de entrar, sesiones, actividad, hogares y solicitudes de dueño). */
export function useAccount() {
  const { user } = useApp()
  return useQuery({ queryKey: accountKey(user.id), queryFn: () => loadAccount() })
}

export function useRefreshAccount() {
  const { user } = useApp()
  const qc = useQueryClient()
  return () => Promise.all([qc.invalidateQueries({ queryKey: accountKey(user.id) }), qc.invalidateQueries({ queryKey: ["identities", user.id] }), qc.invalidateQueries({ queryKey: ["notifications"] })])
}
