import type { Issue } from "@/lib/automations/schema"
import type { StepResult } from "@/lib/automations/types"

/** Resultado de «Probar» una automatización (simulación con datos reales del libro, sin cambiar nada). */
export type TestResult = { ok: boolean; msg?: string; status?: string; steps: StepResult[]; evento?: { descripcion: string; monto: number | null; fecha: string }; issues: Issue[] }
