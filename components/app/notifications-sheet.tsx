"use client"

import Link from "next/link"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { formatDistanceToNowStrict } from "date-fns"
import { es } from "date-fns/locale"
import { CheckCheck } from "lucide-react"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Icon } from "@/components/mirai/icon"
import { createClient } from "@/utils/supabase/client"
import { cn } from "@/lib/utils"
import { Illustration } from "@/components/mirai/illustration"
import { useShell } from "./shell-store"
import { useApp } from "./app-context"

const KIND_ICON: Record<string, string> = { pago: "calendar-clock", cobro: "hand-coins", hormiga: "coffee", presupuesto: "chart-pie", inversion: "trending-up", meta: "target", contador: "user-round-check", logro: "medal", sistema: "info", opinion: "message-square-heart" }

export function useNotifications() {
  const { user, book } = useApp()
  return useQuery({
    queryKey: ["notifications", user.id, book.id],
    queryFn: async () => {
      const { data, error } = await createClient()
        .from("notifications").select("*").eq("user_id", user.id)
        .or(`book_id.eq.${book.id},book_id.is.null`).order("created_at", { ascending: false }).limit(50)
      if (error) throw new Error(error.message)
      return data
    },
  })
}

export function NotificationsSheet() {
  const open = useShell((s) => s.bell)
  const setOpen = useShell((s) => s.setBell)
  const { user } = useApp()
  const qc = useQueryClient()
  const { data, isPending } = useNotifications()
  const markAll = useMutation({
    mutationFn: async () => {
      await createClient().from("notifications").update({ read_at: new Date().toISOString() }).eq("user_id", user.id).is("read_at", null)
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  })
  const markOne = (id: string) => createClient().from("notifications").update({ read_at: new Date().toISOString() }).eq("id", id).then(() => qc.invalidateQueries({ queryKey: ["notifications"] }))

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent className="w-full gap-0 sm:max-w-md">
        <SheetHeader className="border-b">
          <SheetTitle>Notificaciones</SheetTitle>
          <SheetDescription>Pagos que se acercan, cobros, alertas de presupuesto y novedades.</SheetDescription>
          <Button variant="ghost" size="sm" className="w-fit" disabled={!data?.some((n) => !n.read_at)} onClick={() => markAll.mutate()}>
            <CheckCheck /> Marcar todo como leído
          </Button>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto p-2">
          {isPending ? (
            Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex gap-3 p-3"><Skeleton className="size-11 rounded-full" /><div className="grid flex-1 gap-2"><Skeleton className="h-4 w-3/4" /><Skeleton className="h-3 w-1/2" /></div></div>
            ))
          ) : !data?.length ? (
            <Empty className="mt-10">
              <EmptyHeader>
                <EmptyMedia><Illustration k="sin-avisos" width={190} /></EmptyMedia>
                <EmptyTitle>No tienes notificaciones</EmptyTitle>
                <EmptyDescription>Te avisaremos cuando se acerque un pago.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          ) : (
            data.map((n) => {
              const body = (
                <>
                  <span className={cn("grid size-14 shrink-0 place-items-center rounded-full", n.read_at ? "bg-secondary text-muted-foreground" : "bg-brand-gradient text-white")}>
                    <Icon name={KIND_ICON[n.kind] ?? "bell"} className="size-6" />
                  </span>
                  <span className="grid flex-1 gap-0.5 text-left">
                    <span className={cn("text-[15px]", n.read_at ? "font-normal" : "font-semibold")}>{n.titulo}</span>
                    {n.cuerpo && <span className="text-sm text-muted-foreground">{n.cuerpo}</span>}
                    <span className={cn("text-xs", n.read_at ? "text-muted-foreground" : "font-medium text-brand")}>
                      {formatDistanceToNowStrict(new Date(n.created_at), { locale: es, addSuffix: true })}
                    </span>
                  </span>
                  {!n.read_at && <span className="mt-2 size-2.5 shrink-0 rounded-full bg-brand" aria-label="Sin leer" />}
                </>
              )
              const cls = "flex w-full gap-3 rounded-lg p-2.5 hover:bg-hover"
              return n.href ? (
                <Link key={n.id} href={n.href} className={cls} onClick={() => { markOne(n.id); setOpen(false) }}>{body}</Link>
              ) : (
                <button key={n.id} type="button" className={cls} onClick={() => markOne(n.id)}>{body}</button>
              )
            })
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
