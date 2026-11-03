// Fotos y PDF para la IA sobre el puerto ObjectStore (V7-E). Las rutas de la IA cuelgan de /v1/books/:bookId, así que
// BookGuard ya revisó que la persona es miembro del libro; aquí solo se exige que el archivo sea de la carpeta de ese
// libro (la misma regla de la política «adjuntos leer» de storage.objects). Lo elige ai.module.ts cuando OBJECT_STORE
// no es `supabase` (con `supabase` sigue SupabaseJsAiFiles, que descarga con la sesión de la persona).
import { Injectable } from "@nestjs/common"
import type { FileRef } from "@mirai/contracts/modules/chat"
import type { DbScope } from "../../../core/db/scope"
import { DomainError } from "../../../core/errors/domain-error"
import { ObjectStore } from "../../../core/files/object-store"
import { AiFiles, mimeOf, pathOfBook, type ReadFile } from "../ai-files"

const NOT_FOUND = "No encontramos ese archivo en este libro."

@Injectable()
export class ObjectStoreAiFiles extends AiFiles {
  constructor(private readonly files: ObjectStore) {
    super()
  }

  async read(_scope: DbScope, bookId: string, ref: FileRef): Promise<ReadFile> {
    if ("data" in ref) {
      const data = ref.data.replace(/^data:[^;]+;base64,/, "")
      return { name: ref.name, type: ref.type, size: Buffer.byteLength(data, "base64"), data }
    }
    if (!pathOfBook(bookId, ref.fileId)) throw DomainError.notFound(NOT_FOUND)
    const [info, buf] = await Promise.all([this.files.head({ bucket: "attachments", key: ref.fileId }), this.files.read({ bucket: "attachments", key: ref.fileId })])
    if (!buf) throw DomainError.notFound(NOT_FOUND)
    return { name: ref.name ?? ref.fileId.split("/").pop() ?? "archivo", type: mimeOf(ref.fileId, info?.contentType), size: buf.length, data: buf.toString("base64") }
  }
}
