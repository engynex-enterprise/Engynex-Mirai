// Controller de archivos (V7-G): sin :bookId en la ruta; las reglas de cada bucket (libro, carpeta propia o consola)
// las revisa FilesService antes de firmar nada.
import { Controller } from "@nestjs/common"
import { TsRestHandler, tsRestHandler } from "@ts-rest/nest"
import { filesContract as c } from "@mirai/contracts/modules/files"
import { Idempotent } from "../../core/idempotency/idempotency.interceptor"
import { RateLimit } from "../../core/rate-limit/rate-limit.guard"
import { ok } from "../book-tables/http"
import { FilesService } from "./files.service"

@Controller()
export class FilesController {
  constructor(private readonly svc: FilesService) {}

  @TsRestHandler(c.createUpload)
  @RateLimit("subidas", "user", "Subiste muchos archivos seguidos")
  @Idempotent()
  createUpload() {
    return tsRestHandler(c.createUpload, async ({ body }) => ok(await this.svc.createUpload(body)))
  }

  @TsRestHandler(c.completeUpload)
  completeUpload() {
    return tsRestHandler(c.completeUpload, async ({ body }) => ok(await this.svc.completeUpload(body.uploadId)))
  }

  @TsRestHandler(c.url)
  url() {
    return tsRestHandler(c.url, async ({ query }) => ({ status: 200, body: await this.svc.url(query.bucket, query.key, query.download === "1") }))
  }

  @TsRestHandler(c.remove)
  remove() {
    return tsRestHandler(c.remove, async ({ body }) => ok(await this.svc.remove(body.bucket, body.key)))
  }
}
