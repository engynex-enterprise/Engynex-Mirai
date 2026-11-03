"use client"

import { useEffect, useRef } from "react"
import { useRouter } from "next/navigation"
import { useQueryClient } from "@tanstack/react-query"
import { toast } from "@/components/mirai/toast"
import { useBookId } from "@/components/app/app-context"
import { openAppNotifs } from "./api"

const KEY = "mirai-leidas"

/** Avisos emergentes al abrir Mirai: hasta 3 urgentes no vistos, escalonados. */
export function NotifPopups() {
  const bookId = useBookId()
  const router = useRouter()
  const qc = useQueryClient()
  const done = useRef<string | null>(null)
  useEffect(() => {
    if (done.current === bookId) return
    done.current = bookId
    const t = setTimeout(async () => {
      const list = await openAppNotifs()
      qc.invalidateQueries({ queryKey: ["notifications"] })
      let seen: string[] = []
      try { seen = JSON.parse(localStorage.getItem(KEY) || "[]") } catch { seen = [] }
      const show = list.filter((n) => !seen.includes(`${bookId}:${n.id}`)).slice(0, 3)
      show.forEach((n, i) => setTimeout(() => {
        const fn = n.lvl === "bad" ? toast.error : toast.warning
        fn(n.t, { description: n.b, duration: 9000, action: { label: "Ver", onClick: () => router.push(`/${n.go}`) } })
      }, 600 + i * 500))
      try { localStorage.setItem(KEY, JSON.stringify([...seen, ...show.map((n) => `${bookId}:${n.id}`)].slice(-300))) } catch { /* sin almacenamiento */ }
    }, 2500)
    return () => clearTimeout(t)
  }, [bookId, qc, router])
  return null
}
