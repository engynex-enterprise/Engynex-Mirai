// Puertos de la IA (§2.1). El servicio no conoce Supabase ni el AI SDK: el adaptador llama a @mirai/ai (el mismo código
// de la web) con el cliente del alcance (RLS de la persona) y el runtime de @mirai/services (SystemScope para ai_usage,
// ai_cache, cupos y límites). Las pruebas los cambian por dobles: nunca se llama a un proveedor real.
import type { AdvisorConsult } from "@mirai/ai/server/advisor"
import type { AiImage, CategorySuggestion, ClassifyOut, EntitySuggestion, InvoiceResult, LoanDocData, ParsedNL, PrimaInput, PrimaPlan, ReceiptResult, Tono } from "@mirai/ai/server/ai-actions"
import type { AiCtx } from "@mirai/ai/server/ctx"
import type { ModelList } from "@mirai/ai/server/integrations-ai"
import type { MailScan } from "@mirai/ai/server/mail"
import type { MonthSummary } from "@mirai/ai/server/reports"
import type { AdminAiUsage, MyAiUsage } from "@mirai/ai/server/usage-report"
import type { DbScope } from "../../core/db/scope"

export type ImageThunk = () => Promise<AiImage>

export abstract class AiPort {
  abstract invoice(ctx: AiCtx, scope: DbScope, file: ImageThunk): Promise<InvoiceResult>
  abstract receipt(ctx: AiCtx, file: ImageThunk): Promise<ReceiptResult>
  abstract loanDoc(ctx: AiCtx, file: ImageThunk, kind: "cobrar" | "pagar"): Promise<{ ok: true; d: LoanDocData } | { ok: false; msg: string }>
  abstract classify(ctx: AiCtx, scope: DbScope, items: unknown[]): Promise<ClassifyOut[] | null>
  abstract hormiga(ctx: AiCtx, scope: DbScope, mes: string): Promise<{ ok: boolean; msg: string }>
  abstract category(ctx: AiCtx, scope: DbScope, i: { desc: string; nombre: string; icons: string[] }): Promise<CategorySuggestion>
  abstract entity(ctx: AiCtx, q: string): Promise<EntitySuggestion>
  abstract cobro(ctx: AiCtx, msg: string, tono: Tono): Promise<{ ok: boolean; text: string }>
  abstract prima(ctx: AiCtx, data: PrimaInput): Promise<PrimaPlan>
  abstract parse(ctx: AiCtx, scope: DbScope, text: string): Promise<ParsedNL>
  abstract advisor(ctx: AiCtx, scope: DbScope, text: string): Promise<AdvisorConsult>
  abstract usage(ctx: AiCtx, scope: DbScope): Promise<MyAiUsage>
  abstract monthSummary(ctx: AiCtx, scope: DbScope, mes: string): Promise<MonthSummary>
  abstract mailScan(ctx: AiCtx, scope: DbScope, query?: string): Promise<MailScan>
  abstract integrationTest(ctx: AiCtx, kind: string): Promise<{ ok: boolean; msg: string }>
  abstract integrationModels(ctx: AiCtx, kind: string, apiKey?: string): Promise<ModelList>
}

export type AiSettingsPatch = { creditUsd?: number; cuposActivo?: boolean; avisoPct?: number; cacheHoras?: number }
export type ModelPrice = { in: number; out: number; cached?: number }

/** Consola › Uso de IA (SystemScope; cada cambio queda en admin_audit con quien lo hizo). */
export abstract class AiAdminPort {
  abstract usage(dias: number): Promise<AdminAiUsage>
  abstract saveSettings(actor: string, p: AiSettingsPatch): Promise<void>
  abstract setPlanCupo(actor: string, planId: string, cupo: number | null): Promise<void>
  abstract setModelPrice(actor: string, model: string, price: ModelPrice | null): Promise<void>
  abstract clearCache(actor: string): Promise<number>
}
