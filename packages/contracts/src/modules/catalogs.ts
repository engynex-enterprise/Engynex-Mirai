// Módulo `catalogs` (docs/arquitectura/v6-separacion-front-back.md §2.6). Dueño: F2-D.
// Endpoints: CRUD genérico de categorías, entidades, medios de pago, reglas, proveedores y contactos; sugerir categoría.
//
// F2-B dejó aquí el módulo de ejemplo de punta a punta (solo lectura): GET /v1/books/:bookId/categories, con la misma
// consulta que `useCategories()` de apps/web (book_id del libro, sin borradas, orden por `sort`). F2-D agrega el resto.
import { initContract } from "@ts-rest/core"
import { z } from "zod"
import type { Row } from "@mirai/db/tables"
import { COMMON_ERRORS, Uuid } from "../common"

export const meta = { id: "catalogs", owner: "F2-D" } as const

/** Fila de `categories` tal como la devuelve la base (ids como texto: la respuesta no revalida el formato UUID). */
export const CategoryRow = z.object({
  id: z.string(),
  book_id: z.string(),
  nombre: z.string(),
  grupo: z.string(),
  icon: z.string(),
  sort: z.number(),
  tope: z.number(),
  created_at: z.string(),
  updated_at: z.string(),
  created_by: z.string().nullable(),
  deleted_at: z.string().nullable(),
}) satisfies z.ZodType<Row<"categories">>
export type CategoryRow = z.infer<typeof CategoryRow>

export const BookParams = z.object({ bookId: Uuid })
export const CategoriesQuery = z.object({
  /** Filtra por grupo del 50/30/20 (necesidades, gustos, ahorro…). */
  grupo: z.string().trim().min(1).max(40).optional(),
})

const c = initContract()
export const catalogsContract = c.router(
  {
    listCategories: {
      method: "GET",
      path: "/v1/books/:bookId/categories",
      pathParams: BookParams,
      query: CategoriesQuery,
      responses: { ...COMMON_ERRORS, 200: z.array(CategoryRow) },
      summary: "Categorías de gasto del libro (sin las borradas), en el orden de la persona",
    },
  },
  { strictStatusCodes: true },
)
