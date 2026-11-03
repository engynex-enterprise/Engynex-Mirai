// Casos de uso de /v1/books/:b/ai/** (§2.1). El rol ya lo revisó BookGuard (@MinRole/@Can en el controller); el plan
// lo bloquea @mirai/ai (run.ts) con el mismo mensaje de la web. Aquí: armar quién llama, leer el archivo (Storage o
// cuerpo) y traducir `{ ok: false, msg }` a DomainError con el mismo texto (ai-errors.ts).
import { Injectable } from "@nestjs/common"
import { imageOf, type PrimaInput, type Tono } from "@mirai/ai/server/ai-actions"
import type { FileRef } from "@mirai/contracts/modules/chat"
import { AiContext } from "./ai-context"
import { ai, aiError, unwrap } from "./ai-errors"
import { AiFiles } from "./ai-files"
import { AiPort, type ImageThunk } from "./ai.port"

@Injectable()
export class AiService {
  constructor(
    private readonly port: AiPort,
    private readonly files: AiFiles,
    private readonly who: AiContext,
  ) {}

  /**
   * Lee y valida el archivo antes de llamar a la IA: 404 si no existe o no es de este libro y 400 si no es una foto o
   * un PDF de hasta 6 MB (la web decía "No pude leer la imagen"; la API da la causa).
   */
  private async image(ref: FileRef): Promise<ImageThunk> {
    const f = await this.files.read(this.who.scope, this.who.get().book.id, ref)
    let img
    try {
      img = imageOf(f)
    } catch (e) {
      throw aiError((e as Error).message, e)
    }
    return async () => img
  }

  async invoice(file: FileRef) {
    const img = await this.image(file)
    return unwrap(await ai(() => this.port.invoice(this.who.get(), this.who.scope, img)))
  }

  async receipt(file: FileRef) {
    const img = await this.image(file)
    return unwrap(await ai(() => this.port.receipt(this.who.get(), img)))
  }

  async loanDoc(file: FileRef, kind: "cobrar" | "pagar") {
    const img = await this.image(file)
    return unwrap(await ai(() => this.port.loanDoc(this.who.get(), img, kind))).d
  }

  async classify(items: unknown[]) {
    return { items: await ai(() => this.port.classify(this.who.get(), this.who.scope, items)) }
  }

  async hormiga(mes: string) {
    const r = await ai(() => this.port.hormiga(this.who.get(), this.who.scope, mes))
    if (!r.ok) throw aiError(r.msg)
    return { msg: r.msg }
  }

  async category(i: { desc: string; nombre: string; icons: string[] }) {
    return (await ai(() => this.port.category(this.who.get(), this.who.scope, i))).s ?? null
  }

  async entity(q: string) {
    return (await ai(() => this.port.entity(this.who.get(), q))).s ?? null
  }

  async cobro(msg: string, tono: Tono) {
    const r = await ai(() => this.port.cobro(this.who.get(), msg, tono))
    if (!r.ok) throw aiError(r.text)
    return { text: r.text }
  }

  async prima(data: PrimaInput) {
    const r = await ai(() => this.port.prima(this.who.get(), data))
    if (!r.ok || !r.plan) throw aiError(r.msg ?? "No se pudo obtener la sugerencia")
    return r.plan
  }

  async parse(text: string) {
    const r = await ai(() => this.port.parse(this.who.get(), this.who.scope, text))
    if (!r.ok) return null
    return { tipo: r.tipo!, valor: r.valor!, descripcion: r.descripcion!, fecha: r.fecha!, category_id: r.category_id ?? null }
  }

  async advisor(text: string) {
    const r = await ai(() => this.port.advisor(this.who.get(), this.who.scope, text))
    return r.ok ? { consulta: r.consulta, faltan: r.faltan, preguntas: [] } : { consulta: null, faltan: [], preguntas: r.preguntas }
  }

  usage() {
    return ai(() => this.port.usage(this.who.get(), this.who.scope))
  }

  monthSummary(mes: string) {
    return ai(() => this.port.monthSummary(this.who.get(), this.who.scope, mes))
  }

  async mailScan(query?: string) {
    const r = await ai(() => this.port.mailScan(this.who.get(), this.who.scope, query))
    if (!r.ok) throw aiError(r.msg ?? "No pudimos leer tu correo.")
    return { rows: r.rows, ...(r.ia !== undefined ? { ia: r.ia } : {}) }
  }

  /** El resultado de la prueba (que pase o no) es el dato; solo el rol y el libro dan error. */
  integrationTest(kind: string) {
    return ai(() => this.port.integrationTest(this.who.get(), kind))
  }

  async integrationModels(kind: string, apiKey?: string) {
    const r = await ai(() => this.port.integrationModels(this.who.get(), kind, apiKey))
    if (!r.ok) throw aiError(r.msg ?? "No pudimos leer los modelos del proveedor.")
    return { models: r.models, ...(r.rec ? { rec: r.rec } : {}) }
  }
}
