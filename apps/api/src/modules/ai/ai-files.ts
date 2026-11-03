// Fotos y PDF para la IA (§2.7.10). `fileId` = ruta en el bucket `attachments` (`<bookId>/…`: la RLS de Storage exige ser
// miembro del libro de la carpeta) o el archivo en base64 en el cuerpo (compatibilidad mientras el front migra). Puerto
// propio de F2-F: cuando `files` (F2-D-2) exponga su servicio de descarga, el adaptador puede delegar en él.
import type { FileRef } from "@mirai/contracts/modules/chat"
import type { AiFile } from "@mirai/ai/server/ai-actions"
import type { DbScope } from "../../core/db/scope"

export type ReadFile = AiFile & { name: string }

export abstract class AiFiles {
  /** Lee el archivo. Lanza DomainError (404 si no existe o no es de este libro; 400 si no es una foto o PDF válida). */
  abstract read(scope: DbScope, bookId: string, ref: FileRef): Promise<ReadFile>
}

const EXT: Record<string, string> = { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", gif: "image/gif", heic: "image/heic", heif: "image/heif", avif: "image/avif", pdf: "application/pdf" }
/** Tipo por la extensión cuando Storage no lo informa. */
export const mimeOf = (path: string, given?: string | null) => (given && given !== "application/octet-stream" ? given : EXT[path.split(".").pop()?.toLowerCase() ?? ""] ?? "application/octet-stream")

/** ¿La ruta es de la carpeta del libro (y sin saltos)? */
export const pathOfBook = (bookId: string, path: string) => path.startsWith(`${bookId}/`) && !path.includes("..") && !path.includes("//")
