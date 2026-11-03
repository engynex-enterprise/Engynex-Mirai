// Módulo `books` (docs/arquitectura/v6-separacion-front-back.md §2.6). Dueño: F2-I; lo llenó V7-G.
// Endpoints: /v1/books: libros y sus ajustes (book_settings, nómina).
//
// V7-G (E1 y E18 de docs/arquitectura/v7-gcp-total.md §2):
//   POST   /v1/books                      → createBook de apps/web/components/app/actions.ts (RPC create_book, límite
//                                            de libros del plan, queda como último libro de la persona)
//   PATCH  /v1/books/:bookId              → nombre, tipo e ícono («Edita» o más: política "editar libros")
//   DELETE /v1/books/:bookId              → papelera (deleted_at), solo el dueño, escribiendo el nombre; nunca el
//                                            libro principal ni el último del hogar
//   POST   /v1/trash/books/:id/restore    → «Deshacer» (sin :bookId: el libro borrado ya no pasa por BookGuard)
//   GET    /v1/books/:bookId/settings     → book_settings (lo que hoy lee useSettings)
//   PATCH  /v1/books/:bookId/settings     → useBookSettingsSave (features/settings/prefs.ts), setup-view, renta-owner
//                                            (uvt), logros-view (gami)… con cada campo validado.
import { initContract } from "@ts-rest/core"
import { z } from "zod"
import { ApiError, ApiOk, COMMON_ERRORS, Money, Uuid } from "../common"

export const meta = { id: "books", owner: "F2-I" } as const

export const BOOK_TIPOS = ["personal", "negocio", "otro"] as const
const Icon = z.string().regex(/^[a-z0-9-]{1,40}$/, "Ícono inválido")
const Nombre = z.string().trim().min(1, "Escribe el nombre del libro").max(60, "Máximo 60 caracteres")

export const BookParams = z.object({ bookId: Uuid })
export const TrashParams = z.object({ id: Uuid })

export const Book = z.object({ id: z.string(), household_id: z.string(), nombre: z.string(), tipo: z.string(), icon: z.string(), is_default: z.boolean(), sample: z.boolean(), deleted_at: z.string().nullable() })
export type Book = z.infer<typeof Book>

export const NewBook = z.object({ householdId: Uuid, nombre: Nombre, tipo: z.enum(BOOK_TIPOS, { error: "Tipo de libro inválido" }).default("personal"), icon: Icon.default("book") })
export const BookPatch = z.object({ nombre: Nombre, tipo: z.enum(BOOK_TIPOS, { error: "Tipo de libro inválido" }), icon: Icon }).partial().refine((p) => Object.keys(p).length > 0, "No hay nada para guardar")
export type BookPatch = z.infer<typeof BookPatch>
export const DeleteBook = z.object({ confirm: z.string().max(200) })

/** jsonb de ajustes: un objeto de hasta 20 KB. */
const JsonObj = z.record(z.string().max(60), z.unknown()).refine((v) => JSON.stringify(v).length <= 20_000, "Demasiados datos en este ajuste")
const Pct = z.number().int("Usa números enteros").min(0, "Mínimo 0 %").max(100, "Máximo 100 %")
const PorAnio = z.record(z.string().regex(/^\d{4}$/, "Año inválido"), z.number().positive("El valor debe ser mayor que 0").max(1e9))

export const BookSettings = z.object({
  book_id: z.string(), meta: z.string(), umbral: z.number(), limite: z.number(), trm: z.unknown(), trm_auto: z.boolean(), pct: z.unknown(), emerg_meta: z.number(),
  anticipo: z.number(), usura: z.number(), usura_auto: z.boolean(), corte_q: z.number(), alerta_pres: z.number(), estricto: z.string(), defaults: z.unknown(),
  notif: z.unknown(), ia: z.unknown(), relaciones: z.array(z.string()), apps: z.unknown(), setup: z.unknown(), uvt: z.unknown(), smmlv: z.unknown(), gami: z.boolean(),
  nomina: z.unknown(), updated_at: z.string(),
})
export type BookSettings = z.infer<typeof BookSettings>

/** Lo que se cambia de los ajustes del libro (todo opcional). Mismos límites que la base y que la v4. */
export const BookSettingsPatch = z.object({
  meta: z.string().trim().max(200, "Máximo 200 caracteres"),
  umbral: Money.min(0, "El valor no puede ser negativo"),
  limite: Money.min(0, "El valor no puede ser negativo"),
  trm: z.record(z.string().regex(/^[A-Z]{3}$/, "Moneda inválida (USD, EUR…)"), z.number().positive("La tasa debe ser mayor que 0").max(1e6)),
  trm_auto: z.boolean(),
  pct: z.object({ n: Pct, g: Pct, a: Pct }),
  emerg_meta: z.number().int().min(1, "Mínimo 1 mes").max(36, "Máximo 36 meses"),
  anticipo: z.number().int().min(0).max(100, "Máximo 100 %"),
  usura: z.number().min(0).max(100, "Máximo 100 %"),
  usura_auto: z.boolean(),
  corte_q: z.number().int().min(1, "Entre el día 1 y el 27").max(27, "Entre el día 1 y el 27"),
  alerta_pres: z.number().int().min(1, "Mínimo 1 %").max(200, "Máximo 200 %"),
  estricto: z.enum(["prudente", "equilibrado", "flexible"], { error: "Usa prudente, equilibrado o flexible" }),
  defaults: JsonObj,
  notif: z.record(z.string().max(40), z.boolean()),
  ia: JsonObj,
  relaciones: z.array(z.string().trim().min(1).max(60)).max(40, "Máximo 40 relaciones"),
  apps: z.array(z.unknown()).max(60).refine((v) => JSON.stringify(v).length <= 20_000, "Demasiados datos en este ajuste"),
  setup: JsonObj,
  uvt: PorAnio,
  smmlv: PorAnio,
  gami: z.boolean(),
  /** Ajustes de nómina del libro (NominaCfg de @mirai/domain/payroll). */
  nomina: JsonObj,
}).partial().refine((p) => Object.keys(p).length > 0, "No hay nada para guardar")
export type BookSettingsPatch = z.infer<typeof BookSettingsPatch>

const ERR = { ...COMMON_ERRORS, 402: ApiError, 409: ApiError } as const

const c = initContract()
export const booksContract = c.router(
  {
    create: { method: "POST", path: "/v1/books", body: NewBook, responses: { ...ERR, 200: ApiOk(z.object({ bookId: z.string() })) }, summary: "Crea un libro en el hogar (límite de libros del plan; acepta Idempotency-Key)", description: "Queda como tu último libro (profiles.last_book_id); la web pone su cookie mirai-book con el bookId." },
    update: { method: "PATCH", path: "/v1/books/:bookId", pathParams: BookParams, body: BookPatch, responses: { ...ERR, 200: ApiOk(Book) }, summary: "Cambia el nombre, el tipo o el ícono del libro («Edita» o más)" },
    remove: { method: "DELETE", path: "/v1/books/:bookId", pathParams: BookParams, body: DeleteBook, responses: { ...ERR, 200: ApiOk(z.object({ msg: z.string() })) }, summary: "Manda el libro a la papelera (solo el dueño, escribiendo su nombre)", description: "409 si es el libro principal o el último del hogar." },
    restore: { method: "POST", path: "/v1/trash/books/:id/restore", pathParams: TrashParams, body: c.noBody(), responses: { ...ERR, 200: ApiOk(Book) }, summary: "Deshacer: el libro vuelve de la papelera (solo el dueño; límite de libros del plan)" },
    settings: { method: "GET", path: "/v1/books/:bookId/settings", pathParams: BookParams, responses: { ...ERR, 200: BookSettings }, summary: "Ajustes del libro" },
    updateSettings: { method: "PATCH", path: "/v1/books/:bookId/settings", pathParams: BookParams, body: BookSettingsPatch, responses: { ...ERR, 200: BookSettings }, summary: "Cambia ajustes del libro («Edita» o más; cada campo validado)" },
  },
  { strictStatusCodes: true },
)
