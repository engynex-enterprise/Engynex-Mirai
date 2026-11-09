"use client"

// Cuánto cuesta una integración, igual en Ajustes › Integraciones y en consola › Integraciones globales.
// Vivía duplicado en settings/tabs/integrations.tsx; una sola copia para que las dos pantallas digan lo mismo.
import { StatusPill, type PillTone } from "@/components/mirai/status-pill"
import { Tip } from "@/components/mirai/tip"
import type { IntegrationDef } from "@/lib/integrations/registry"

type Free = IntegrationDef["free"]

const FREE: Record<Free, [PillTone, string]> = {
  gratis: ["pagado", "Gratis"],
  "plan-gratis": ["estimado", "Plan gratis"],
  pago: ["gray", "De pago"],
}

const FREE_TIP: Record<Free, string> = {
  gratis: "No cuesta nada usarlo.",
  "plan-gratis": "Tiene un plan gratis con un límite de uso; si lo pasas, el proveedor puede cobrar.",
  pago: "El proveedor cobra por uso en tu cuenta con él.",
}

/** Badge de costo (Gratis · Plan gratis · De pago) con la explicación de la diferencia. */
export function FreeBadge({ free }: { free: Free }) {
  const [tone, label] = FREE[free]
  return (
    <Tip label={FREE_TIP[free]}>
      <span className="inline-flex">
        <StatusPill tone={tone}>{label}</StatusPill>
      </span>
    </Tip>
  )
}
