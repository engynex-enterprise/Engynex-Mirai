import { HttpException, NotFoundException } from "@nestjs/common"
import { describe, expect, it } from "vitest"
import { API_ERROR_STATUS } from "@mirai/contracts/common"
import { issuesToDetails, toApiError } from "./all-exceptions.filter"
import { DomainError, INTERNAL_MSG } from "./domain-error"

describe("DomainError", () => {
  it("cada código lleva su estado HTTP", () => {
    expect(DomainError.role().status).toBe(403)
    expect(DomainError.plan("x").status).toBe(402)
    expect(DomainError.unauthenticated().headers).toMatchObject({ "www-authenticate": expect.stringMatching(/^Bearer/) })
    expect(DomainError.rateLimited("x", 0.2).headers).toEqual({ "retry-after": "1" })
    for (const [code, status] of Object.entries(API_ERROR_STATUS)) expect(new DomainError(code as never, "x").status).toBe(status)
  })

  it("fromPg traduce los errores de PostgREST/Postgres sin filtrar el detalle", () => {
    expect(DomainError.fromPg({ code: "42501", message: "new row violates row-level security policy" })).toMatchObject({ code: "ROLE_DENIED", msg: "Tu rol no permite hacer esto en este hogar." })
    expect(DomainError.fromPg({ code: "P0001", message: "El fondo no tiene saldo suficiente" })).toMatchObject({ code: "VALIDATION", msg: "El fondo no tiene saldo suficiente" })
    expect(DomainError.fromPg({ code: "23505", message: "duplicate key" }).code).toBe("CONFLICT")
    expect(DomainError.fromPg({ code: "23503", message: "fk" }).code).toBe("CONFLICT")
    expect(DomainError.fromPg({ code: "PGRST116", message: "0 rows" }).code).toBe("NOT_FOUND")
    expect(DomainError.fromPg({ code: "22P02", message: "invalid input syntax for type uuid" }).code).toBe("VALIDATION")
    expect(DomainError.fromPg({ code: "57014", message: "canceling statement due to statement timeout" }).code).toBe("UPSTREAM")
    expect(DomainError.fromPg({ code: "PGRST301", message: "JWT expired" }).code).toBe("UNAUTHENTICATED")
    expect(DomainError.fromPg(new TypeError("fetch failed")).code).toBe("UPSTREAM")
    const internal = DomainError.fromPg({ code: "XX000", message: "relation secreta no existe" })
    expect(internal).toMatchObject({ code: "INTERNAL", msg: INTERNAL_MSG })
    expect(internal.msg).not.toMatch(/secreta/)
  })
})

describe("toApiError (filtro global)", () => {
  it("DomainError conserva msg, code y details; agrega requestId", () => {
    expect(toApiError(DomainError.notFound("No encontramos ese gasto", { id: "x" }), "r1")).toMatchObject({ status: 404, body: { ok: false, code: "NOT_FOUND", msg: "No encontramos ese gasto", details: { id: "x" }, requestId: "r1" }, unexpected: false })
  })
  it("HttpException de Nest/Fastify → mensajes en español por estado", () => {
    expect(toApiError(new NotFoundException("Cannot GET /x")).body).toMatchObject({ code: "NOT_FOUND", msg: "Esta ruta no existe." })
    expect(toApiError(new HttpException("too large", 413)).body.code).toBe("VALIDATION")
    expect(toApiError({ statusCode: 400, code: "FST_ERR_CTP_INVALID_MEDIA_TYPE" }).body.code).toBe("VALIDATION")
    expect(toApiError({ statusCode: 503 })).toMatchObject({ status: 502, body: { code: "UPSTREAM" } })
  })
  it("cualquier otra cosa: 500 INTERNAL genérico", () => {
    const r = toApiError(new Error("contraseña de la base en el mensaje"), "r2")
    expect(r).toMatchObject({ status: 500, unexpected: true, body: { code: "INTERNAL", msg: INTERNAL_MSG, requestId: "r2" } })
    expect(JSON.stringify(r.body)).not.toMatch(/contraseña/)
  })
  it("issuesToDetails arma { campo: mensaje } con la primera falla de cada campo", () => {
    expect(issuesToDetails([{ message: "a", path: ["x"] }, { message: "b", path: ["x"] }, { message: "c", path: [{ key: "y" }, 0] }, { message: "d" }])).toEqual({ x: "a", "y.0": "c", _: "d" })
  })
})
