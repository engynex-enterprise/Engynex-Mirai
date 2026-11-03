// Piezas comunes de los contratos de escritura de F2-D (gastos, ingresos, fijos, tarjetas, préstamos, ahorro,
// patrimonio, presupuesto e importar). Dueño: F2-D.
import { z } from "zod"
import { ApiError, COMMON_ERRORS, Money, Uuid } from "../common"

export const BookParams = z.object({ bookId: Uuid })
export const IdParams = z.object({ bookId: Uuid, id: Uuid })

/** Errores de un comando que escribe: los comunes + plan (402) y conflicto (409: ya pagado, Idempotency-Key en curso…). */
export const WRITE_ERRORS = { ...COMMON_ERRORS, 402: ApiError, 409: ApiError } as const

/** Valor mayor que cero (pagos, abonos, compras). */
export const Positive = Money.positive("El valor debe ser mayor que cero")
/** Texto corto obligatorio. */
export const Name = (msg: string, max = 200) => z.string({ error: msg }).trim().min(1, msg).max(max, `Máximo ${max} caracteres`)
export const Note = z.string().trim().max(4000, "Máximo 4000 caracteres")

/** Fila tal como la devuelve la base. */
export const Row = z.record(z.string(), z.unknown())

/**
 * Periodo de un gasto fijo: 'AAAA-MM' (mensual, bimestral…), 'AAAA-MM-Q1' / '-Q2' (quincenal), 'AAAA' (anual) o 'U'
 * (pago único). Mismo formato que fijoPeriods de @mirai/domain/fixed.
 */
export const Periodo = z.string().regex(/^(\d{4}(-(0[1-9]|1[0-2])(-Q[12])?)?|U)$/, "Periodo inválido (usa AAAA-MM, AAAA-MM-Q1, AAAA o U)")
