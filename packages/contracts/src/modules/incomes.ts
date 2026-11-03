// Módulo `incomes` (docs/arquitectura/v6-separacion-front-back.md §2.6). Dueño: F2-D.
// - POST …/incomes/plan: calcula el plan del ingreso (planIngreso de @mirai/domain/reparto) sin guardar: lo que llega
//   en cada pago, los descuentos del mes y el promedio por pago (lo que guardan `valor` y `bruto`).
// - POST …/incomes: guarda el ingreso como el formulario (features/incomes/income-form.tsx): categoría del tipo de
//   ingreso (la crea si el libro no la tiene), reparto por quincena (`reparto`: tipo, mensual, b1/b2, n1/n2, d1/d2,
//   ded, x1, dow, dias, mes) y `valor`/`bruto` = promedio por pago, para que el total del mes no cambie en la web.
// El CRUD simple de incomes y extra_incomes (ingresos extra) sale del contrato genérico book-tables.
import { initContract } from "@ts-rest/core"
import { z } from "zod"
import { ApiOk, Money, Uuid } from "../common"
import { BookParams, Name, Row, WRITE_ERRORS } from "./write-common"

export const meta = { id: "incomes", owner: "F2-D" } as const

const Pct = z.union([z.number().min(0).max(100), z.string().max(12)])
/** Descuentos de nómina (Deducciones de @mirai/domain/payroll): siempre del mes (`mes: true`). */
export const Deducciones = z.object({
  tipo: z.enum(["empleado", "independiente", "pensionado", "otro"]).optional(),
  salud: z.boolean().optional(), pension: z.boolean().optional(), fsp: z.boolean().optional(), ret: z.boolean().optional(), arl: z.boolean().optional(),
  saludP: Pct.optional(), pensionP: Pct.optional(), ibcP: Pct.optional(), arlN: z.union([z.string().max(4), z.number().int().min(1).max(5)]).optional(),
  retModo: z.enum(["auto", "manual", "pct", "proc2"]).optional(),
  retV: z.union([z.number().min(0).max(1e12), z.string().max(20)]).optional(),
  otros: z.array(z.object({ n: z.string().max(80).optional(), v: z.union([z.number().min(0).max(1e12), z.string().max(20)]).optional(), pct: z.boolean().optional() })).max(20).optional(),
  mes: z.boolean().optional(),
})

const TIPOS = ["salario", "bono", "comisiones", "prima", "honorarios", "pension", "arriendo", "negocio", "inversiones", "otro"] as const
export const PlanInput = z.object({
  frec: z.enum(["mensual", "quincenal", "semanal", "diario", "anual"]),
  /** Valor del mes antes de descuentos (el del pago si es anual). */
  mensual: Money.min(0, "El valor no puede ser negativo"),
  /** Quincenal: valor de la 1ª y la 2ª quincena (por defecto la mitad del mes cada una). */
  b1: Money.min(0).optional(),
  b2: Money.min(0).optional(),
  /** Diario: días que te pagan al mes (30 por defecto). */
  dias: z.number().int().min(1).max(31).optional(),
  /** Descuentos de nómina (null = sin descuentos). Solo en pesos (COP). */
  deducciones: Deducciones.nullable().optional(),
  /** Quincenal: en qué quincena se descuentan (mitad, q1, q2 o pers con x1). */
  ded: z.enum(["mitad", "q1", "q2", "pers"]).optional(),
  x1: Money.min(0).optional(),
  /** Año de la referencia (salario mínimo, UVT); por defecto el de hoy. */
  year: z.number().int().min(2020).max(2100).optional(),
})
export const PlanPago = z.object({ n: z.string(), bruto: z.number(), desc: z.number(), neto: z.number() })
export const PlanOut = z.object({
  mensual: z.number(), desc: z.number(), items: z.array(z.object({ n: z.string(), v: z.number(), h: z.string() })), neto: z.number(),
  pagos: z.array(PlanPago), valor: z.number(), bruto: z.number(),
  ref: z.object({ smmlv: z.number(), uvt: z.number() }),
})

export const IncomeInput = PlanInput.extend({
  id: Uuid.optional(),
  concepto: Name("Escribe el nombre del ingreso", 60),
  tipo: z.enum(TIPOS).default("salario"),
  /** Si no llega, la del tipo de ingreso (se crea si no existe). */
  category_id: Uuid.nullable().optional(),
  /** Día del pago mensual / anual (1..31). */
  dia: z.number().int().min(1).max(31).default(30),
  /** Quincenal: días de pago de la 1ª (1..15) y la 2ª (16..31). */
  d1: z.number().int().min(1).max(15).optional(),
  d2: z.number().int().min(16).max(31).optional(),
  /** Semanal: día de la semana (0 domingo … 6 sábado). */
  dow: z.number().int().min(0).max(6).optional(),
  /** Anual: mes del pago (1..12). */
  mes: z.number().int().min(1).max(12).optional(),
  currency: z.string().trim().length(3).default("COP"),
  member_id: Uuid.nullable().optional(),
  payment_method_id: Uuid.nullable().optional(),
})
export type IncomeInput = z.input<typeof IncomeInput>
export const IncomeSaved = z.object({ income: Row, creado: z.boolean(), plan: PlanOut, categoriaCreada: z.boolean() })

const c = initContract()
export const incomesContract = c.router(
  {
    plan: {
      method: "POST", path: "/v1/books/:bookId/incomes/plan", pathParams: BookParams, body: PlanInput,
      responses: { ...WRITE_ERRORS, 200: ApiOk(PlanOut) }, summary: "Calcula lo que llega en cada pago (planIngreso), sin guardar",
    },
    save: {
      method: "POST", path: "/v1/books/:bookId/incomes", pathParams: BookParams, body: IncomeInput,
      responses: { ...WRITE_ERRORS, 200: ApiOk(IncomeSaved) },
      summary: "Guarda el ingreso con su reparto por quincena (valor y bruto = promedio por pago)",
      description: "Rol: «Registra sus gastos» (solo los suyos) o más. Crear la categoría del tipo de ingreso: desde «Colabora» (si no, queda sin categoría).",
    },
  },
  { strictStatusCodes: true },
)
