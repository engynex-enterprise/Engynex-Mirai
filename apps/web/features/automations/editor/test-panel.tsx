"use client"

import { useState } from "react"
import { Play } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { FieldGroup } from "@/components/ui/field"
import { FormField } from "@/components/mirai/field"
import { MoneyInput } from "@/components/mirai/money-input"
import { Notice } from "@/components/mirai/notice"
import { Spinner } from "@/components/ui/spinner"
import { formatCOP } from "@/lib/domain/money"
import type { Graph } from "@/lib/automations/types"
import { testAutomation, type TestResult } from "../api"
import { StepList } from "../shared"

/** "Probar": corre la automatización con datos del libro (o los que escribas) sin cambiar nada y muestra el recorrido. */
export function TestPanel({ id, graph, onResult, result }: { id: string; graph: Graph; result: TestResult | null; onResult: (r: TestResult | null) => void }) {
  const [monto, setMonto] = useState<number | null>(null)
  const [desc, setDesc] = useState("")
  const [busy, setBusy] = useState(false)
  const run = async () => {
    setBusy(true)
    try { onResult(await testAutomation({ id, graph, monto, descripcion: desc.trim() || null })) }
    finally { setBusy(false) }
  }
  return (
    <div className="grid content-start gap-4" data-testid="prueba">
      <p className="text-sm text-muted-foreground">Mirai usa tu último movimiento real (o un ejemplo) y te muestra qué pasaría, <b>sin cambiar nada</b>. Si quieres, prueba con otros datos:</p>
      <FieldGroup className="gap-3">
        <FormField label="Monto de prueba (opcional)" htmlFor="t-monto" tip={false}><MoneyInput id="t-monto" value={monto} onChange={(v) => setMonto(v ?? null)} placeholder="El de tu último movimiento" /></FormField>
        <FormField label="Descripción de prueba (opcional)" htmlFor="t-desc" tip={false}><Input id="t-desc" className="h-11" value={desc} maxLength={120} onChange={(e) => setDesc(e.target.value)} placeholder="Ej. Domicilio Rappi" /></FormField>
      </FieldGroup>
      <Button onClick={run} disabled={busy}>{busy ? <Spinner /> : <Play />} Probar ahora</Button>
      {result && !result.ok && <Notice tone="bad" title="No se pudo probar">{result.msg}</Notice>}
      {result?.ok && (
        <div className="grid gap-3" aria-live="polite">
          {result.evento && (
            <p className="rounded-lg bg-brand-soft p-3 text-sm">
              Probado con: <b>{result.evento.descripcion || "datos del libro"}</b>{result.evento.monto !== null && <> por <b data-money>{formatCOP(result.evento.monto)}</b></>} · {result.evento.fecha}
            </p>
          )}
          {result.issues.length > 0 && <Notice tone="warn" title="Ojo: tiene cosas por revisar">{result.issues[0].msg}{result.issues.length > 1 ? ` (y ${result.issues.length - 1} más)` : ""}. No se podrá activar hasta corregirlas.</Notice>}
          {result.status === "esperando" || result.steps.some((s) => s.wait) ? <Notice tone="info" title="Tiene una espera">En la vida real, los pasos después de “Esperar” corren cuando se cumplen los días.</Notice> : null}
          <h3 className="font-semibold">Recorrido</h3>
          <StepList steps={result.steps} />
          {result.steps.length <= 1 && <p className="text-sm text-muted-foreground">No llegó a ninguna acción: revisa las conexiones o las condiciones.</p>}
        </div>
      )}
    </div>
  )
}
