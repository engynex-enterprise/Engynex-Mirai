"use client"

import { useTransition } from "react"
import { useRouter } from "next/navigation"
import { useQueryClient } from "@tanstack/react-query"
import { History, Upload } from "lucide-react"
import { toast } from "@/components/mirai/toast"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Spinner } from "@/components/ui/spinner"
import { useCanEdit } from "@/components/app/app-context"
import { importV4Backup } from "./api"

/**
 * Traer el respaldo de Mirai 4.0. Va en todos los planes: en Gratis se muestra debajo de la invitación a Premium de
 * Importar extractos (tus datos de antes no son una función de pago).
 */
export function V4RestoreCard() {
  const canEdit = useCanEdit()
  const qc = useQueryClient()
  const router = useRouter()
  const [pending, start] = useTransition()
  if (!canEdit) return null
  return (
    <Card className="shadow-card ring-0" data-testid="respaldo-v4">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base"><History className="size-5 text-brand" /> ¿Vienes de la versión anterior de Mirai?</CardTitle>
        <CardDescription>Sube el respaldo JSON que descargaste en Ajustes › Respaldo de la versión 4. Traemos tus ingresos, gastos, gastos fijos, préstamos, metas, inversiones y todo lo demás a este libro. Funciona en todos los planes.</CardDescription>
      </CardHeader>
      <CardContent>
        <label className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-lg border px-4 text-sm font-medium hover:bg-hover">
          {pending ? <Spinner /> : <Upload className="size-4" />} Subir respaldo (.json)
          <input type="file" accept=".json,application/json" className="sr-only" disabled={pending} onChange={(e) => {
            const f = e.target.files?.[0]; if (!f) return
            start(async () => {
              try {
                const rep = await importV4Backup(await f.text())
                const total = Object.values(rep).reduce((a, b) => a + b, 0)
                toast.success("Respaldo importado", { description: `${total} registros traídos a este libro.` })
                qc.clear(); router.refresh()
              } catch (er) { toast.error("No se pudo importar el respaldo", { description: (er as Error).message }) }
            })
          }} />
        </label>
      </CardContent>
    </Card>
  )
}
