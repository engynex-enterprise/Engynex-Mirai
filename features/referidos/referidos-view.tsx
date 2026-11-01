"use client"

import { useQuery } from "@tanstack/react-query"
import { Copy, Gift, MessageCircle, Share2 } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import { Skeleton } from "@/components/ui/skeleton"
import { PageHeader } from "@/components/mirai/page-header"
import { StatusPill } from "@/components/mirai/status-pill"
import { fmtDate } from "@/lib/format"
import { misReferidos } from "./actions"

const ESTADO = { recompensado: ["pagado", "Ganaron los dos"], registrado: ["info", "Se registró"], sin_recompensa: ["gray", "Sin premio"] } as const

/** Invita y gana: tu enlace de invitación, cómo funciona y a quiénes has invitado. */
export function ReferidosView() {
  const { data, isPending } = useQuery({ queryKey: ["referidos"], queryFn: () => misReferidos() })
  const texto = data ? `Estoy usando Mirai para ordenar mi plata y me está sirviendo mucho. Regístrate con mi enlace y los dos ganamos ${data.dias} días de Mirai ${data.plan}: ${data.link}` : ""
  const copy = async (t: string, msg: string) => { try { await navigator.clipboard.writeText(t); toast.success(msg) } catch { toast.error("No se pudo copiar") } }
  const share = async () => { if (navigator.share) { try { await navigator.share({ title: "Te invito a Mirai", text: texto }); return } catch { return } } copy(texto, "Invitación copiada: pégala en WhatsApp") }
  return (
    <div className="grid gap-6">
      <PageHeader id="referidos" title="Invita y gana" description={data ? `Por cada persona que se registre con tu enlace y cree su hogar, los dos ganan ${data.dias} días de Mirai ${data.plan}.` : "Invita a tu familia y amigos a ordenar su plata."} />
      {isPending || !data ? <Skeleton className="h-48" /> : (
        <>
          {!data.activo && <p className="rounded-lg bg-warning-soft p-3 text-sm text-warning">El programa de invitaciones está en pausa. Tus invitaciones se registran, pero por ahora no dan premio.</p>}
          <Card className="gap-4 p-5 shadow-card ring-0 sm:p-6">
            <div className="flex items-center gap-3"><span className="grid size-12 place-items-center rounded-2xl bg-[linear-gradient(135deg,#FFD36B,#E08A00)] text-white"><Gift className="size-6" /></span><div><p className="text-sm text-muted-foreground">Tu código</p><p className="font-mono text-2xl font-bold tracking-widest">{data.codigo}</p></div></div>
            <div className="flex flex-col gap-2 sm:flex-row"><Input readOnly value={data.link} aria-label="Tu enlace de invitación" onFocus={(e) => e.target.select()} className="h-11" /><Button className="h-11" variant="outline" onClick={() => copy(data.link, "Enlace copiado")}><Copy /> Copiar enlace</Button></div>
            <div className="grid gap-2 sm:grid-cols-2">
              <Button size="lg" asChild><a href={`https://wa.me/?text=${encodeURIComponent(texto)}`} target="_blank" rel="noreferrer"><MessageCircle /> Invitar por WhatsApp</a></Button>
              <Button size="lg" variant="outline" onClick={share}><Share2 /> Compartir de otra forma</Button>
            </div>
            <ol className="grid gap-2 text-sm text-muted-foreground sm:grid-cols-3">
              <li><b className="text-foreground">1.</b> Comparte tu enlace.</li>
              <li><b className="text-foreground">2.</b> Tu invitado se registra y crea su hogar.</li>
              <li><b className="text-foreground">3.</b> Los dos reciben {data.dias} días de {data.plan} (hasta {data.max} premios para ti).</li>
            </ol>
          </Card>
          <Card className="gap-3 p-5 shadow-card ring-0">
            <h2 className="font-semibold">Tus invitados ({data.invitados.length})</h2>
            {!data.invitados.length ? <p className="text-sm text-muted-foreground">Todavía nadie se ha registrado con tu enlace.</p> : (
              <ul className="grid gap-2">{data.invitados.map((i) => <li key={i.id} className="flex items-center justify-between gap-3 rounded-lg bg-secondary/40 p-3 text-sm"><span><b>{i.nombre}</b> · {fmtDate(i.fecha.slice(0, 10), { year: true })}</span><StatusPill tone={ESTADO[i.estado as keyof typeof ESTADO]?.[0] ?? "gray"}>{ESTADO[i.estado as keyof typeof ESTADO]?.[1] ?? i.estado}</StatusPill></li>)}</ul>
            )}
          </Card>
        </>
      )}
    </div>
  )
}
