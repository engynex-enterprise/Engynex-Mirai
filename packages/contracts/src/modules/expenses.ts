// Módulo `expenses` (docs/arquitectura/v6-separacion-front-back.md §2.6). Dueño: F2-D.
// - POST …/expenses: registrar (o editar) un gasto con las reglas del formulario (features/expenses/expense-form.tsx):
//   categoría por regla → historial → palabras clave y, si el plan y los ajustes lo permiten, la IA (puerto
//   ExpenseClassifier, lo conecta F2-F); gasto hormiga (auto/sí/no), deducible, medio de pago por defecto, fondo de
//   emergencia para "Imprevistos" (use_emergency_fund) y la sugerencia "¿es el pago de un gasto fijo?" (sugerirPagoFijo).
// - POST …/expenses/:id/link-fixed · unlink-fixed · use-fund: las RPC link_expense_fixed / unlink_expense_fixed /
//   use_emergency_fund (cascadas con x-mirai-enlaces).
// El CRUD simple (PUT/DELETE/restore) sale del contrato genérico book-tables con BOOK_TABLE_POLICY.expenses.
import { initContract } from "@ts-rest/core"
import { z } from "zod"
import { ApiOk, IsoDate, Uuid } from "../common"
import { BookParams, IdParams, Name, Note, Periodo, Positive, Row, WRITE_ERRORS } from "./write-common"

export const meta = { id: "expenses", owner: "F2-D" } as const

export const ExpenseInput = z.object({
  /** Id del navegador (crear dos veces con el mismo id no duplica: edita). Sin id, lo pone la API. */
  id: Uuid.optional(),
  descripcion: Name("Escribe en qué gastaste"),
  valor: Positive,
  fecha: IsoDate.optional(),
  /** Si llega, es la categoría escogida a mano (cat_src = manual). Si no, la decide Mirai. */
  category_id: Uuid.nullable().optional(),
  /** ¿Gasto hormiga? auto = lo decide Mirai (IA si está prendida). */
  hormiga: z.enum(["auto", "si", "no"]).default("auto"),
  payment_method_id: Uuid.nullable().optional(),
  provider_id: Uuid.nullable().optional(),
  /** Integrante del hogar (null = toda la familia). */
  member_id: Uuid.nullable().optional(),
  /** Deducción de renta a la que puede servir (DEDUCIBLES de @mirai/domain/renta), null = no aplica. */
  deducible: z.enum(["salud", "vivienda", "educacion", "dependiente"]).nullable().optional(),
  nota: Note.optional(),
  currency: z.string().trim().length(3, "Moneda de 3 letras (COP, USD…)").optional(),
  origen: z.enum(["manual", "correo", "ocr", "voz", "compartido"]).default("manual"),
  /** Si la categoría es "Imprevistos" y hay fondo de emergencia con saldo, pagarlo con el fondo. */
  usarFondo: z.boolean().default(false),
})
export type ExpenseInput = z.input<typeof ExpenseInput>

export const FixedSuggestion = z.object({
  fixed_id: z.string(), nombre: z.string(), periodo: z.string(), due: z.string(),
  /** Lo que falta del periodo (su valor, o el resto si ya tiene abonos). */
  valor: z.number(),
  /** Lo ya abonado a ese periodo (0 si no tiene abonos). */
  abonado: z.number().optional(),
  /** ¿Con este gasto queda pagado el periodo? */
  completo: z.boolean().optional(),
})
export const ExpenseSaved = z.object({
  expense: Row,
  creado: z.boolean(),
  /** De dónde salió la categoría (manual, regla, historial, palabras, ia) o null si no se encontró. */
  categoria: z.object({ id: z.string(), src: z.string() }).nullable(),
  /** ¿Cuenta como gasto hormiga? (con la decisión guardada o la regla local). */
  hormiga: z.boolean(),
  /** Saldo del fondo después de pagar el imprevisto con él, o null si no se usó. */
  fondo: z.object({ saldo: z.number() }).nullable(),
  /** "¿Es el pago de un gasto fijo?": la web pregunta y, si dice que sí, llama a link-fixed. */
  sugerenciaFijo: FixedSuggestion.nullable(),
  /** Avisos para mostrar (p. ej. "No se pudo descontar del fondo"). */
  avisos: z.array(z.string()),
})
export type ExpenseSaved = z.infer<typeof ExpenseSaved>

export const LinkFixed = z.object({
  fixedId: Uuid,
  periodo: Periodo,
  /**
   * ¿Con este gasto queda pagado el periodo? false: es un abono y falta el resto (un periodo con abonos se puede
   * seguir enlazando). Sin decirlo, la API lo calcula: queda pagado si el gasto cubre lo que falta.
   */
  completo: z.boolean().optional(),
})
export const UseFund = z.object({ valor: Positive.optional() })

const c = initContract()
export const expensesContract = c.router(
  {
    save: {
      method: "POST", path: "/v1/books/:bookId/expenses", pathParams: BookParams, body: ExpenseInput,
      responses: { ...WRITE_ERRORS, 200: ApiOk(ExpenseSaved) },
      summary: "Registra o edita un gasto con las reglas del formulario (categoría, hormiga, fondo y sugerencia de fijo)",
      description: "Rol: «Registra sus gastos» (solo los suyos) o más. La IA solo con el plan que la incluye y los ajustes prendidos. Usar el fondo y la sugerencia de fijo: desde «Colabora».",
    },
    linkFixed: {
      method: "POST", path: "/v1/books/:bookId/expenses/:id/link-fixed", pathParams: IdParams, body: LinkFixed,
      responses: { ...WRITE_ERRORS, 200: ApiOk(z.unknown()) }, summary: "Usa este gasto como el pago del fijo en ese periodo (link_expense_fixed)",
    },
    unlinkFixed: {
      method: "POST", path: "/v1/books/:bookId/expenses/:id/unlink-fixed", pathParams: IdParams, body: c.noBody(),
      responses: { ...WRITE_ERRORS, 200: ApiOk(z.object({ id: z.string() })) }, summary: "Deshace el enlace con el gasto fijo (unlink_expense_fixed)",
    },
    useFund: {
      method: "POST", path: "/v1/books/:bookId/expenses/:id/use-fund", pathParams: IdParams, body: UseFund,
      responses: { ...WRITE_ERRORS, 200: ApiOk(z.object({ saldo: z.number() })) }, summary: "Paga el gasto con el fondo de emergencia (use_emergency_fund)",
    },
  },
  { strictStatusCodes: true },
)
