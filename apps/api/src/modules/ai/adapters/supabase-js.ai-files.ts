// Adaptador de hoy: Supabase Storage con el JWT de la persona (la RLS del bucket `attachments` exige ser miembro del libro
// de la carpeta). En Cloud Storage (fase 4) se cambia por una descarga con la cuenta de servicio y la misma regla de ruta.
import { Injectable } from "@nestjs/common"
import type { FileRef } from "@mirai/contracts/modules/chat"
import type { DbScope } from "../../../core/db/scope"
import { SupabaseJsFactory } from "../../../core/db/supabase-js.factory"
import { DomainError } from "../../../core/errors/domain-error"
import { AiFiles, mimeOf, pathOfBook, type ReadFile } from "../ai-files"

const NOT_FOUND = "No encontramos ese archivo en este libro."

@Injectable()
export class SupabaseJsAiFiles extends AiFiles {
  constructor(private readonly sb: SupabaseJsFactory) {
    super()
  }

  async read(scope: DbScope, bookId: string, ref: FileRef): Promise<ReadFile> {
    if ("data" in ref) {
      const data = ref.data.replace(/^data:[^;]+;base64,/, "")
      return { name: ref.name, type: ref.type, size: Buffer.byteLength(data, "base64"), data }
    }
    if (!pathOfBook(bookId, ref.fileId)) throw DomainError.notFound(NOT_FOUND)
    const { data, error } = await this.sb.for(scope).storage.from("attachments").download(ref.fileId)
    if (error || !data) throw DomainError.notFound(NOT_FOUND)
    const buf = Buffer.from(await data.arrayBuffer())
    return { name: ref.name ?? ref.fileId.split("/").pop() ?? "archivo", type: mimeOf(ref.fileId, data.type), size: buf.length, data: buf.toString("base64") }
  }
}
