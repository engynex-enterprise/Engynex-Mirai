// Adaptador de AiPort/AiAdminPort: @mirai/ai (mismo código que apps/web) con el cliente supabase-js del alcance (RLS de
// la persona). Lo que necesita la clave secreta (ai_usage, ai_cache, cupos, límites, consola) lo hace @mirai/services
// con el SystemScope que configuró ServicesRuntime (F2-E).
import { Injectable } from "@nestjs/common"
import { advisorConsultWith } from "@mirai/ai/server/advisor"
import {
  classifyExpensesWith, identifyEntityWith, improveCobroWith, parseNLWith, primaPlanWith, readInvoiceWith, readLoanDocWith, readReceiptWith,
  reviewMonthHormigaWith, suggestCategoryWith, type PrimaInput, type Tono,
} from "@mirai/ai/server/ai-actions"
import type { AiCtx } from "@mirai/ai/server/ctx"
import { listAiModels, testAiIntegration } from "@mirai/ai/server/integrations-ai"
import { scanMailWith } from "@mirai/ai/server/mail"
import { monthSummaryWith } from "@mirai/ai/server/reports"
import { adminAiUsageReport, clearAiCache, myAiUsageWith, saveAiSettings, setModelPrice, setPlanAiCupo } from "@mirai/ai/server/usage-report"
import type { DbScope } from "../../../core/db/scope"
import { SupabaseJsFactory } from "../../../core/db/supabase-js.factory"
import { AiAdminPort, AiPort, type AiSettingsPatch, type ImageThunk, type ModelPrice } from "../ai.port"

@Injectable()
export class PackageAi extends AiPort {
  constructor(private readonly sb: SupabaseJsFactory) {
    super()
  }

  invoice(ctx: AiCtx, scope: DbScope, file: ImageThunk) {
    return readInvoiceWith(ctx, this.sb.for(scope), file)
  }
  receipt(ctx: AiCtx, file: ImageThunk) {
    return readReceiptWith(ctx, file)
  }
  loanDoc(ctx: AiCtx, file: ImageThunk, kind: "cobrar" | "pagar") {
    return readLoanDocWith(ctx, file, kind)
  }
  classify(ctx: AiCtx, scope: DbScope, items: unknown[]) {
    return classifyExpensesWith(ctx, this.sb.for(scope), items)
  }
  hormiga(ctx: AiCtx, scope: DbScope, mes: string) {
    return reviewMonthHormigaWith(ctx, this.sb.for(scope), mes)
  }
  category(ctx: AiCtx, scope: DbScope, i: { desc: string; nombre: string; icons: string[] }) {
    return suggestCategoryWith(ctx, this.sb.for(scope), i.desc, i.nombre, i.icons)
  }
  entity(ctx: AiCtx, q: string) {
    return identifyEntityWith(ctx, q)
  }
  cobro(ctx: AiCtx, msg: string, tono: Tono) {
    return improveCobroWith(ctx, msg, tono)
  }
  prima(ctx: AiCtx, data: PrimaInput) {
    return primaPlanWith(ctx, data)
  }
  parse(ctx: AiCtx, scope: DbScope, text: string) {
    return parseNLWith(ctx, this.sb.for(scope), text)
  }
  advisor(ctx: AiCtx, scope: DbScope, text: string) {
    return advisorConsultWith(ctx, this.sb.for(scope), text)
  }
  usage(ctx: AiCtx, scope: DbScope) {
    return myAiUsageWith(ctx, this.sb.for(scope))
  }
  monthSummary(ctx: AiCtx, scope: DbScope, mes: string) {
    return monthSummaryWith(ctx, this.sb.for(scope), mes)
  }
  mailScan(ctx: AiCtx, scope: DbScope, query?: string) {
    return scanMailWith(ctx, this.sb.for(scope), query)
  }
  integrationTest(ctx: AiCtx, kind: string) {
    return testAiIntegration(ctx, kind)
  }
  integrationModels(ctx: AiCtx, kind: string, apiKey?: string) {
    return listAiModels(ctx, kind, apiKey)
  }
}

@Injectable()
export class PackageAiAdmin extends AiAdminPort {
  usage(dias: number) {
    return adminAiUsageReport(dias)
  }
  saveSettings(actor: string, p: AiSettingsPatch) {
    return saveAiSettings(actor, p)
  }
  setPlanCupo(actor: string, planId: string, cupo: number | null) {
    return setPlanAiCupo(actor, planId, cupo)
  }
  setModelPrice(actor: string, model: string, price: ModelPrice | null) {
    return setModelPrice(actor, model, price)
  }
  clearCache(actor: string) {
    return clearAiCache(actor)
  }
}
