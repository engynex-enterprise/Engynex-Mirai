// Módulo `loans` (docs/arquitectura/v6-separacion-front-back.md §2.6). Dueño: F2-D.
// - POST …/loans: crea la deuda (Le debo) o el préstamo (Me deben) por tipo (LOAN_TIPOS de @mirai/domain/loan-tipos)
//   como features/loans/loan-form.tsx: fecha de la primera cuota (`primera`), pago único con `vence`, y QUIÉN presta
//   siempre como un registro escogible sin duplicar (contacto, entidad o proveedor ya existentes por documento/NIT o
//   nombre normalizado: findContact / findEntity / normProv de @mirai/domain/registros). Con `acreedor` (solo el
//   nombre) aplica la misma regla de la migración 20261103002000: empeño → entidad «Casa de empeño», compra a cuotas →
//   proveedor, banco → entidad, lo demás → contacto. Las cuotas ya pagadas antes de Mirai van en `pagosPrevios`.
// - POST …/loans/:id/payments: pago de N cuotas (valores del plan de loanEngine) o un abono (a plazo o a cuota),
//   como features/loans/pay-loan-dialog.tsx.
// El CRUD simple (editar, borrar, deshacer pagos) sale del contrato genérico book-tables. El recordatorio de cobro por
// WhatsApp lo da F2-E (notifications/delivery: …/notifications/cobro-whatsapp).
import { initContract } from "@ts-rest/core"
import { z } from "zod"
import { ApiOk, IsoDate, Money, Uuid } from "../common"
import { BookParams, IdParams, Name, Note, Positive, Row, WRITE_ERRORS } from "./write-common"

export const meta = { id: "loans", owner: "F2-D" } as const

const LoanTipo = z.enum(["banco", "empeno", "fiado", "persona", "cuotas", "gota", "presto", "vendi", "otro"])

/** Persona, entidad o tienda nueva (si ya existe una igual, se usa esa). */
export const NuevoRegistro = z.discriminatedUnion("tabla", [
  z.object({
    tabla: z.literal("contacts"),
    nombre: Name("Escribe el nombre de la persona", 120),
    doc_tipo: z.enum(["CC", "CE", "PA", "TI", "NIT", "PPT"]).optional(),
    doc: z.string().trim().max(30).optional(),
    telefono: z.string().trim().max(30).optional(),
    email: z.string().trim().max(200).optional(),
    relacion: z.string().trim().max(60).optional(),
    tipo: z.enum(["persona", "empresa"]).optional(),
  }),
  z.object({ tabla: z.literal("entities"), nombre: Name("Escribe el nombre de la entidad", 60), nit: z.string().trim().max(30).optional(), tipo: z.enum(["Banco", "Cooperativa", "Fintech", "Billetera", "Fondo", "Casa de empeño", "Otro"]).optional() }),
  z.object({ tabla: z.literal("providers"), nombre: Name("Escribe el nombre de la tienda o el almacén", 120), nit: z.string().trim().max(30).optional() }),
])
export type NuevoRegistro = z.infer<typeof NuevoRegistro>

/** Quién presta (o a quién le prestaste): un registro que ya existe, uno nuevo o solo el nombre. */
export const Quien = z.union([
  z.object({ contact_id: Uuid }),
  z.object({ entity_id: Uuid }),
  z.object({ provider_id: Uuid }),
  z.object({ nuevo: NuevoRegistro }),
  z.object({ acreedor: Name("Escribe quién es", 60) }),
])

export const PagoPrevio = z.object({ fecha: IsoDate, tipo: z.enum(["cuota", "abono"]), valor: Money.min(0), modo: z.enum(["cuota", "plazo"]).nullable().optional() })

export const LoanInput = z.object({
  id: Uuid.optional(),
  kind: z.enum(["pagar", "cobrar"]),
  tipo: LoanTipo,
  quien: Quien,
  concepto: z.string().trim().max(200).optional(),
  /** Valor financiado (lo que se debe al empezar). */
  monto: Positive,
  sistema: z.enum(["frances", "aleman", "simple", "sin", "americano", "diario", "cuota"]).default("simple"),
  /** Tasa del periodo en % (0 = sin intereses). */
  tasa: z.number().min(0, "La tasa no puede ser negativa").max(100, "Revisa la tasa").default(0),
  tasa_ea: z.number().min(0).max(1000).nullable().optional(),
  frec: z.enum(["mensual", "quincenal", "semanal", "diario", "diariohab", "unico"]).default("mensual"),
  plazo: z.number().int("Usa un número entero de cuotas").min(1, "Mínimo 1 cuota").max(600, "Máximo 600 cuotas").default(1),
  /** Fecha del préstamo. */
  inicio: IsoDate,
  /** Fecha de la primera cuota si no es un periodo después de `inicio`. */
  primera: IsoDate.nullable().optional(),
  /** Pago único: cuándo se paga (obligatoria con frec = unico). */
  vence: IsoDate.nullable().optional(),
  extra: Money.min(0).default(0),
  cuota_fija: Money.min(0).nullable().optional(),
  prenda: z.object({ obj: z.string().trim().max(120), valor: Money.min(0).optional(), limite: IsoDate.nullable().optional(), ref: z.string().trim().max(120).optional() }).nullable().optional(),
  nota: Note.optional(),
  currency: z.string().trim().length(3).optional(),
  pagosPrevios: z.array(PagoPrevio).max(600).default([]),
}).superRefine((v, ctx) => {
  if (v.frec === "unico" && !v.vence) ctx.addIssue({ code: "custom", path: ["vence"], message: "Escribe cuándo se paga" })
  if (v.vence && v.vence < v.inicio) ctx.addIssue({ code: "custom", path: ["vence"], message: "Debe ser después de la fecha del préstamo" })
  if (v.primera && v.primera < v.inicio) ctx.addIssue({ code: "custom", path: ["primera"], message: "La primera cuota debe ser después de la fecha del préstamo" })
})
export type LoanInput = z.input<typeof LoanInput>

export const Registro = z.object({ tabla: z.enum(["contacts", "entities", "providers"]), id: z.string(), nombre: z.string(), creado: z.boolean() })
export const LoanSaved = z.object({ loan: Row, registro: Registro.nullable(), pagosPrevios: z.number() })

export const LoanPayment = z.union([
  z.object({ cuotas: z.number().int().min(1, "Mínimo 1 cuota").max(60), fecha: IsoDate, payment_method_id: Uuid.nullable().optional(), nota: Note.optional() }),
  z.object({ abono: Positive, modo: z.enum(["plazo", "cuota"]).optional(), fecha: IsoDate, payment_method_id: Uuid.nullable().optional(), nota: Note.optional() }),
  /** Parte de la cuota que sigue (no la completa): queda abonada a esa cuota y deja de contar como atrasada por ese valor. */
  z.object({ parcial: Positive, fecha: IsoDate, payment_method_id: Uuid.nullable().optional(), nota: Note.optional() }),
])
export const LoanPaid = z.object({ pagos: z.array(Row), saldo: z.number(), saldado: z.boolean() })

const c = initContract()
export const loansContract = c.router(
  {
    create: {
      method: "POST", path: "/v1/books/:bookId/loans", pathParams: BookParams, body: LoanInput,
      responses: { ...WRITE_ERRORS, 200: ApiOk(LoanSaved) },
      summary: "Crea una deuda o un préstamo por tipo (quién presta sin duplicar contactos, entidades ni proveedores)",
    },
    pay: {
      method: "POST", path: "/v1/books/:bookId/loans/:id/payments", pathParams: IdParams, body: LoanPayment,
      responses: { ...WRITE_ERRORS, 200: ApiOk(LoanPaid) }, summary: "Registra el pago de N cuotas o un abono",
    },
  },
  { strictStatusCodes: true },
)
