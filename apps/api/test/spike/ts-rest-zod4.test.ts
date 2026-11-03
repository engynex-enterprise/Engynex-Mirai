// F2-A-6 · Prueba previa de ts-rest + zod 4 + @ts-rest/nest + @ts-rest/react-query (decisión D2).
// docs/arquitectura/v6-separacion-front-back.md §2.4 y §7 (R6). Un endpoint de ejemplo (`PUT …/t/expenses/:id` y su
// lectura) servido por NestJS 11 sobre Fastify, consumido con el cliente de ts-rest y con TanStack Query v5.
//
// Lo que se comprueba:
//  1. El contrato acepta esquemas zod 4 (Standard Schema) y los tipos se infieren de punta a punta.
//  2. @ts-rest/nest valida body, params y query con zod 4 y deja traducir el error a nuestro ApiError (§2.7.2).
//  3. La validación de respuestas (validateResponses) también corre con zod 4.
//  4. El cliente (initClient) y @ts-rest/react-query v5 (fetchQuery sin React) funcionan contra el servidor.
//  5. OpenAPI: el transformador por defecto de @ts-rest/open-api es de zod 3; con `schemaTransformer` + z.toJSONSchema sí.
import "reflect-metadata"
import { ArgumentsHost, Catch, Controller, type ExceptionFilter, Module } from "@nestjs/common"
import { NestFactory } from "@nestjs/core"
import { FastifyAdapter, type NestFastifyApplication } from "@nestjs/platform-fastify"
import { initClient, initContract } from "@ts-rest/core"
import { TsRestHandler, tsRestHandler, TsRestModule, TsRestRequestValidationError } from "@ts-rest/nest"
import { generateOpenApi } from "@ts-rest/open-api"
import { initTsrReactQuery } from "@ts-rest/react-query/v5"
import { QueryClient } from "@tanstack/react-query"
import { afterAll, beforeAll, describe, expect, expectTypeOf, it } from "vitest"
import { z } from "zod"
import { apiError, ApiError, IsoDate, IsoMonth, Money, Uuid } from "@mirai/contracts/common"
import { enableZodEs, fieldErrors } from "@mirai/contracts/zod-es"

enableZodEs()

// ── Contrato (iría en packages/contracts/src/modules/expenses.ts) ─────────────────────────────────────────────
const ExpenseUpsert = z.object({
  id: Uuid,
  fecha: IsoDate,
  descripcion: z.string().trim().min(1, "Escribe en qué gastaste").max(200),
  valor: Money.positive("El valor debe ser mayor que cero"),
  category_id: Uuid.nullable(),
})
const ExpenseRow = ExpenseUpsert.extend({ book_id: Uuid, created_at: z.string() })
const BookParams = z.object({ bookId: Uuid })

const c = initContract()
const expensesContract = c.router(
  {
    upsert: {
      method: "PUT",
      path: "/v1/books/:bookId/t/expenses/:id",
      pathParams: BookParams.extend({ id: Uuid }),
      body: ExpenseUpsert,
      responses: { 200: z.object({ ok: z.literal(true), data: ExpenseRow }), 400: ApiError, 403: ApiError },
      summary: "Crea o actualiza un gasto (UUID del navegador, idempotente)",
    },
    list: {
      method: "GET",
      path: "/v1/books/:bookId/t/expenses",
      pathParams: BookParams,
      query: z.object({ mes: IsoMonth.optional() }),
      responses: { 200: z.array(ExpenseRow), 400: ApiError },
    },
  },
  { strictStatusCodes: true },
)

// ── Servidor NestJS (iría en apps/api/src/modules/expenses) ───────────────────────────────────────────────────
const BOOK = crypto.randomUUID()
const store = new Map<string, z.infer<typeof ExpenseRow>>()
let romperRespuesta = false

@Controller()
class ExpensesController {
  @TsRestHandler(expensesContract)
  handler() {
    return tsRestHandler(expensesContract, {
      upsert: async ({ params, body }) => {
        if (params.bookId !== BOOK) return { status: 403, body: apiError("ROLE_DENIED", "No tienes acceso a este libro") }
        const row = { ...body, book_id: params.bookId, created_at: new Date().toISOString() }
        store.set(row.id, row)
        return { status: 200, body: { ok: true as const, data: row } }
      },
      list: async ({ query }) => {
        const rows = [...store.values()].filter((r) => !query.mes || r.fecha.startsWith(query.mes))
        // Para probar validateResponses: una fila con un valor que no cumple el esquema de respuesta.
        return { status: 200, body: romperRespuesta ? ([{ ...rows[0], valor: "mil" }] as never) : rows }
      },
    })
  }
}

/** Traduce el error de validación de ts-rest (Standard Schema) a la forma única de la API (§2.7.2). */
@Catch(TsRestRequestValidationError)
class ValidationFilter implements ExceptionFilter {
  catch(e: TsRestRequestValidationError, host: ArgumentsHost) {
    const reply = host.switchToHttp().getResponse<{ status(n: number): { send(b: unknown): void } }>()
    const issues = [...(e.pathParams?.issues ?? []), ...(e.query?.issues ?? []), ...(e.body?.issues ?? [])]
    const details = Object.fromEntries(issues.map((i) => [(i.path ?? []).map((p) => (typeof p === "object" ? p.key : p)).join("."), i.message]))
    reply.status(400).send(apiError("VALIDATION", "Revisa los datos del formulario", { details }))
  }
}

@Module({ imports: [TsRestModule.register({ validateResponses: true })], controllers: [ExpensesController] })
class SpikeModule {}

let app: NestFastifyApplication
let baseUrl = ""

beforeAll(async () => {
  app = await NestFactory.create<NestFastifyApplication>(SpikeModule, new FastifyAdapter(), { logger: false })
  app.useGlobalFilters(new ValidationFilter())
  await app.listen(0, "127.0.0.1")
  baseUrl = await app.getUrl()
})
afterAll(async () => {
  await app?.close()
})

const gasto = (o: Partial<z.input<typeof ExpenseUpsert>> = {}) => ({
  id: crypto.randomUUID(), fecha: "2026-11-02", descripcion: "Mercado", valor: 85000, category_id: null, ...o,
})

describe("ts-rest 3.53 + zod 4: contrato y tipos", () => {
  it("infiere entradas y salidas desde los esquemas zod 4", () => {
    const _client = initClient(expensesContract, { baseUrl: "http://x" })
    type Args = Parameters<typeof _client.upsert>[0]
    expectTypeOf<Args["body"]>().toEqualTypeOf<z.input<typeof ExpenseUpsert>>()
    type Res = Awaited<ReturnType<typeof _client.upsert>>
    expectTypeOf<Extract<Res, { status: 200 }>["body"]["data"]["valor"]>().toEqualTypeOf<number>()
    expectTypeOf<Extract<Res, { status: 403 }>["body"]["code"]>().toEqualTypeOf<ApiError["code"]>()
  })
})

describe("@ts-rest/nest (NestJS 11 + Fastify) con zod 4", () => {
  it("acepta un cuerpo válido y responde con la forma del contrato", async () => {
    const client = initClient(expensesContract, { baseUrl, validateResponse: true })
    const g = gasto()
    const r = await client.upsert({ params: { bookId: BOOK, id: g.id }, body: g })
    expect(r.status).toBe(200)
    if (r.status === 200) expect(r.body.data).toMatchObject({ id: g.id, valor: 85000, book_id: BOOK })
  })

  it("rechaza body, params y query inválidos con ApiError VALIDATION y mensajes en español", async () => {
    const client = initClient(expensesContract, { baseUrl })
    const r = await client.upsert({ params: { bookId: BOOK, id: "no-es-uuid" }, body: gasto({ descripcion: "  ", valor: -5, fecha: "02/11/2026" }) })
    expect(r.status).toBe(400)
    const body = ApiError.parse(r.body)
    expect(body.code).toBe("VALIDATION")
    expect(body.details).toMatchObject({ id: "Identificador inválido", descripcion: "Escribe en qué gastaste", valor: "El valor debe ser mayor que cero", fecha: "Fecha inválida (usa AAAA-MM-DD)" })
    const q = await client.list({ params: { bookId: BOOK }, query: { mes: "2026-13" } })
    expect(q.status).toBe(400)
    expect(ApiError.parse(q.body).details).toMatchObject({ mes: "Mes inválido (usa AAAA-MM)" })
  })

  it("las respuestas de error del propio handler también siguen el contrato (403)", async () => {
    const client = initClient(expensesContract, { baseUrl })
    const g = gasto()
    const r = await client.upsert({ params: { bookId: crypto.randomUUID(), id: g.id }, body: g })
    expect(r.status).toBe(403)
    expect(ApiError.parse(r.body).code).toBe("ROLE_DENIED")
  })

  it("validateResponses detecta una respuesta que no cumple el esquema (500)", async () => {
    romperRespuesta = true
    const r = await fetch(`${baseUrl}/v1/books/${BOOK}/t/expenses`)
    romperRespuesta = false
    expect(r.status).toBe(500)
  })
})

describe("@ts-rest/react-query v5 (TanStack Query) con zod 4", () => {
  it("fetchQuery trae los datos tipados (sin React: initQueryClient)", async () => {
    const tsr = initTsrReactQuery(expensesContract, { baseUrl })
    const qc = tsr.initQueryClient(new QueryClient())
    const res = await qc.list.fetchQuery({ queryKey: ["b", BOOK, "expenses", "2026-11"], queryData: { params: { bookId: BOOK }, query: { mes: "2026-11" } } })
    expect(res.status).toBe(200)
    if (res.status === 200) {
      expectTypeOf(res.body).toEqualTypeOf<z.infer<typeof ExpenseRow>[]>()
      expect(res.body.length).toBeGreaterThan(0)
    }
    expect(typeof tsr.list.useQuery).toBe("function")
    expect(typeof tsr.upsert.useMutation).toBe("function")
  })
})

describe("OpenAPI", () => {
  it("el transformador por defecto (zod 3 / @anatine) no entiende zod 4: deja los esquemas vacíos sin avisar", () => {
    const doc = generateOpenApi(expensesContract, { info: { title: "Mirai API", version: "spike" } })
    const op = doc.paths["/v1/books/{bookId}/t/expenses/{id}"].put
    expect(op.requestBody.content["application/json"].schema).toEqual({})
    expect(op.responses["200"].content["application/json"].schema).toEqual({})
  })

  it("con schemaTransformer + z.toJSONSchema (zod 4 nativo) el documento sale completo", () => {
    const doc = generateOpenApi(expensesContract, { info: { title: "Mirai API", version: "spike" } }, {
      setOperationId: true,
      schemaTransformer: ({ schema }) => (schema instanceof z.ZodType ? (z.toJSONSchema(schema, { io: "input", unrepresentable: "any" }) as never) : null),
    })
    const op = doc.paths["/v1/books/{bookId}/t/expenses/{id}"].put
    expect(op.operationId).toBe("upsert")
    const schema = op.requestBody.content["application/json"].schema
    expect(schema.properties.descripcion).toMatchObject({ type: "string", minLength: 1, maxLength: 200 })
    expect(schema.required).toEqual(expect.arrayContaining(["id", "fecha", "descripcion", "valor"]))
    expect(op.parameters.map((p: { name: string }) => p.name)).toEqual(expect.arrayContaining(["bookId", "id"]))
  })
})

describe("fieldErrors (contratos) sobre un error de zod 4", () => {
  it("convierte issues en { campo: mensaje }", () => {
    const r = ExpenseUpsert.safeParse(gasto({ valor: 0 }))
    expect(fieldErrors(r.error!)).toEqual({ valor: "El valor debe ser mayor que cero" })
  })
})
