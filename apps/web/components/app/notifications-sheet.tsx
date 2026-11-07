"use client"

import Link from "next/link"
import { useState } from "react"
import { useMutation, useQueryClient } from "@tanstack/react-query"
import { useQuery } from "@/lib/query"
import { formatDistanceToNowStrict } from "date-fns"
import { es } from "date-fns/locale"
import { CheckCheck } from "lucide-react"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { Icon } from "@/components/mirai/icon"
import { Segmented } from "@/components/mirai/choice-cards"
import { TONE, type IconTone } from "@/components/mirai/tone-icon"
import { bellList, bellReadAll, bellReadOne } from "@/features/notify/bell"
import { cn } from "@/lib/utils"
import { Illustration } from "@/components/mirai/illustration"
import { useShell } from "./shell-store"
import { useApp } from "./app-context"
import { TransferBellActions } from "@/features/account/transfer"

const KIND_ICON: Record<string, string> = { pago: "calendar-clock", cobro: "hand-coins", hormiga: "coffee", presupuesto: "chart-pie", inversion: "trending-up", meta: "target", tarjeta: "credit-card", empeno: "gem", mesada: "piggy-bank", compartido: "split", automatizacion: "workflow", contador: "user-round-check", logro: "medal", sistema: "info", opinion: "message-square-heart", plan: "crown", hogar: "crown" }
/** Color de referencia de cada tipo de aviso (el mismo en toda la app: pagos ámbar, cobros verde…). */
const KIND_TONE: Record<string, IconTone> = { pago: "amber", cobro: "green", hormiga: "red", presupuesto: "violet", inversion: "blue", meta: "brand", tarjeta: "blue", empeno: "amber", mesada: "brand", compartido: "green", automatizacion: "navy", contador: "navy", logro: "amber", sistema: "gray", opinion: "blue", plan: "violet", hogar: "amber" }

export function useNotifications() {
  const { user, book } = useApp()
  return useQuery({
    queryKey: ["notifications", user.id, book.id],
    // v6: con el interruptor `bell` encendido va por la API (features/notify/bell.ts); apagado, la consulta de siempre.
    queryFn: () => bellList(user.id, book.id),
  })
}

export function NotificationsSheet() {
  const open = useShell((s) => s.bell)
  const setOpen = useShell((s) => s.setBell)
  const { user } = useApp()
  const qc = useQueryClient()
  const { data, isPending } = useNotifications()
  const [ver, setVer] = useState<"todas" | "sin-leer">("todas")
  const unread = data?.filter((n) => !n.read_at).length ?? 0
  const list = ver === "sin-leer" ? data?.filter((n) => !n.read_at) : data
  const markAll = useMutation({
    mutationFn: () => bellReadAll(user.id),
    onSettled: () => qc.invalidateQueries({ queryKey: ["notifications"] }),
  })
  const markOne = (id: string) => bellReadOne(id).then(() => qc.invalidateQueries({ queryKey: ["notifications"] }))

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent className="w-full gap-0 sm:max-w-md">
        <SheetHeader className="border-b">
          <SheetTitle>Notificaciones</SheetTitle>
          <SheetDescription>Pagos que se acercan, cobros, alertas de presupuesto y novedades.</SheetDescription>
          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            <Segmented value={ver} onChange={(v) => setVer(v as typeof ver)} items={[{ value: "todas", label: "Todas" }, { value: "sin-leer", label: unread ? `Sin leer (${unread})` : "Sin leer" }]} />
            <Button variant="ghost" size="sm" className="w-fit" disabled={!unread || markAll.isPending} onClick={() => markAll.mutate()}>
              <CheckCheck /> Marcar todo como leído
            </Button>
          </div>
        </SheetHeader>
        <div className="flex-1 overflow-y-auto p-2">
          {isPending ? (
            Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="flex gap-3 p-3"><Skeleton className="size-11 rounded-full" /><div className="grid flex-1 gap-2"><Skeleton className="h-4 w-3/4" /><Skeleton className="h-3 w-1/2" /></div></div>
            ))
          ) : !list?.length ? (
            <Empty className="mt-10">
              <EmptyHeader>
                <EmptyMedia><Illustration k={data?.length ? "todo-al-dia" : "sin-avisos"} width={190} /></EmptyMedia>
                <EmptyTitle>{data?.length ? "Estás al día" : "No tienes notificaciones"}</EmptyTitle>
                <EmptyDescription>{data?.length ? "Ya leíste todas tus notificaciones." : "Te avisaremos cuando se acerque un pago."}</EmptyDescription>
              </EmptyHeader>
              {!!data?.length && <Button variant="outline" size="sm" onClick={() => setVer("todas")}>Ver todas</Button>}
            </Empty>
          ) : (
            <ul className="grid gap-0.5" aria-label="Lista de notificaciones">{list.map((n) => {
              const body = (
                <>
                  <span className={cn("relative grid size-12 shrink-0 place-items-center rounded-full", n.read_at ? TONE.gray : TONE[KIND_TONE[n.kind] ?? "brand"])}>
                    <Icon name={KIND_ICON[n.kind] ?? "bell"} className="size-6" />
                  </span>
                  <span className="grid flex-1 gap-0.5 text-left">
                    <span className={cn("text-[15px]", n.read_at ? "font-normal" : "font-semibold")}>{n.titulo}</span>
                    {n.cuerpo && <span className="text-sm text-muted-foreground">{n.cuerpo}</span>}
                    <span className={cn("text-xs", n.read_at ? "text-muted-foreground" : "font-medium text-brand")}>
                      {formatDistanceToNowStrict(new Date(n.created_at), { locale: es, addSuffix: true })}
                    </span>
                  </span>
                  {!n.read_at && <span className="mt-2 size-2.5 shrink-0 rounded-full bg-brand" role="img" aria-label="Sin leer" />}
                </>
              )
              const cls = cn("flex w-full gap-3 rounded-lg p-2.5 hover:bg-hover focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none", !n.read_at && "bg-brand-soft/40")
              return (
                <li key={n.id} data-kind={n.kind}>
                  {n.href ? (
                    <Link href={n.href} className={cls} onClick={() => { markOne(n.id); setOpen(false) }}>{body}</Link>
                  ) : (
                    <button type="button" className={cls} onClick={() => markOne(n.id)} title={n.read_at ? undefined : "Marcar como leída"}>{body}</button>
                  )}
                  {/* "Quiere pasarte el hogar": se responde aquí mismo (al responder, el aviso queda leído) */}
                  {!n.read_at && n.dedupe?.startsWith("transfer:") && <TransferBellActions transferId={n.dedupe.slice(9)} onDone={() => qc.invalidateQueries({ queryKey: ["notifications"] })} />}
                </li>
              )
            })}</ul>
          )}
        </div>
      </SheetContent>
    </Sheet>
  )
}
