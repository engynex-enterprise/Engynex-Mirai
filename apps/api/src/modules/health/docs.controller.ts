// OpenAPI de la API (solo fuera de producción y con DOCS activo, §2.4): /docs (Swagger UI) y /docs/openapi.json.
// Por la prueba F2-A-6: SIEMPRE con schemaTransformer + z.toJSONSchema (el transformador por defecto es de zod 3 y
// deja los esquemas vacíos sin avisar).
import { Controller, Get, Header } from "@nestjs/common"
import { generateOpenApi } from "@ts-rest/open-api"
import { z } from "zod"
import { apiContract } from "@mirai/contracts/api"
import { Public } from "../../core/auth/decorators"
import { AppConfig } from "../../core/config/app-config"
import { DomainError } from "../../core/errors/domain-error"
import { SkipDefaultLimit } from "../../core/rate-limit/rate-limit.guard"

export function openApiDocument(version: string) {
  return generateOpenApi(
    apiContract,
    {
      info: { title: "Mirai API", version, description: "API de Mirai (NestJS + ts-rest). Errores: { ok:false, msg, code, requestId }." },
      components: { securitySchemes: { bearer: { type: "http", scheme: "bearer", bearerFormat: "JWT" } } },
      security: [{ bearer: [] }],
    },
    {
      setOperationId: "concatenated-path",
      schemaTransformer: ({ schema }) => (schema instanceof z.ZodType ? (z.toJSONSchema(schema, { io: "input", unrepresentable: "any" }) as never) : null),
    },
  )
}

const SWAGGER = "https://cdn.jsdelivr.net/npm/swagger-ui-dist@5.17.14"

@Controller("docs")
@Public()
@SkipDefaultLimit()
export class DocsController {
  private doc?: unknown
  constructor(private readonly config: AppConfig) {}

  private guard() {
    if (!this.config.docs) throw DomainError.notFound("Esta ruta no existe.")
  }

  @Get("openapi.json")
  openapi() {
    this.guard()
    return (this.doc ??= openApiDocument(this.config.version))
  }

  @Get()
  @Header("content-type", "text/html; charset=utf-8")
  @Header("cache-control", "no-store")
  ui() {
    this.guard()
    return `<!doctype html><html lang="es"><head><meta charset="utf-8"><title>Mirai API</title><link rel="stylesheet" href="${SWAGGER}/swagger-ui.css"></head><body><div id="ui"></div><script src="${SWAGGER}/swagger-ui-bundle.js"></script><script>SwaggerUIBundle({ url: "/docs/openapi.json", dom_id: "#ui" })</script></body></html>`
  }
}
