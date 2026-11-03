// Módulo `tax` (docs/arquitectura/v6-separacion-front-back.md §2.6). Dueño: F2-D (portal: F2-I).
// Endpoints: Renta, calendario fiscal, accesos y portal del contador.
// F2-D agrega aquí sus DTO zod (TaxAsset, Share, Note) y el contrato del titular.
//
// Portal del contador (F2-I-4): /v1/accountant/:token/** SIN sesión; el token es la credencial (AccountantTokenGuard:
// formato, límite `portalContador` por token, acceso sin revocar ni vencido y plan con «impuestos»). Equivale a
// contadorOpen / contadorNotes / contadorNote / contadorFileUrl de apps/web/features/contador/actions.ts.
import { initContract } from "@ts-rest/core"
import { z } from "zod"
import type { RentaData } from "@mirai/domain/integral-extras"
import { ApiError, ApiOk, COMMON_ERRORS, Uuid } from "../common"

export const meta = { id: "tax", owner: "F2-D (portal: F2-I)" } as const

export const AccountantParams = z.object({ token: z.string().min(1).max(200) })
export const PortalShare = z.object({ id: z.string(), book_id: z.string(), label: z.string(), perms: z.string(), expires_at: z.string().nullable(), owner: z.string() })
/** Datos de la Declaración (RentaData de @mirai/domain/integral-extras), de solo lectura. */
export const PortalData = z.record(z.string(), z.unknown()) as unknown as z.ZodType<RentaData>
/** `bloqueado: "plan"`: el enlace existe, pero el plan del cliente ya no incluye el acceso del contador. */
export const PortalOpen = z.union([z.object({ share: PortalShare, data: PortalData }), z.object({ bloqueado: z.literal("plan") })])
export type PortalOpen = z.infer<typeof PortalOpen>
export const PortalNote = z.object({ id: z.string(), autor: z.string(), texto: z.string(), created_at: z.string() })
export const NewPortalNote = z.object({ texto: z.string().max(4000) })
export const FileQuery = z.object({ path: z.string().min(1).max(500) })

const c = initContract()
export const accountantPortalContract = c.router(
  {
    open: { method: "GET", path: "/v1/accountant/:token", pathParams: AccountantParams, responses: { ...COMMON_ERRORS, 200: PortalOpen }, summary: "Abre el portal (suma una vista). 404 si el acceso no existe, venció o se revocó" },
    notes: { method: "GET", path: "/v1/accountant/:token/notes", pathParams: AccountantParams, responses: { ...COMMON_ERRORS, 200: z.array(PortalNote) }, summary: "Notas entre el titular y el contador" },
    addNote: { method: "POST", path: "/v1/accountant/:token/notes", pathParams: AccountantParams, body: NewPortalNote, responses: { ...COMMON_ERRORS, 200: ApiOk(z.object({ saved: z.boolean() })) }, summary: "El contador deja una nota" },
    fileUrl: { method: "GET", path: "/v1/accountant/:token/files", pathParams: AccountantParams, query: FileQuery, responses: { ...COMMON_ERRORS, 200: z.object({ url: z.string().nullable() }) }, summary: "URL firmada (5 min) de un documento marcado como visible para el contador" },
  },
  { strictStatusCodes: true },
)

// ── V7-G: lado del titular (Ajustes › Acceso de tu contador), con sesión y BookGuard ───────────────────────────────
// Equivale a createShare / rotateShare / revokeShare / ownerNote de apps/web/features/contador/actions.ts y a las
// lecturas de contador-view.tsx. El enlace (con el token) se devuelve UNA sola vez; en la base solo queda su hash.
// Ver: cualquier integrante · crear, enlace nuevo y documentos: «Administra» + Premium «impuestos» · quitar el acceso:
// «Administra» (también sin el plan, para poder cerrarlo) · notas: «Colabora» + Premium «impuestos».
const OWNER_ERRORS = { ...COMMON_ERRORS, 402: ApiError, 409: ApiError } as const
export const OwnerBookParams = z.object({ bookId: Uuid })
export const ShareParams = z.object({ bookId: Uuid, shareId: Uuid })
export const AttachmentParams = z.object({ bookId: Uuid, attachmentId: Uuid })
export const OwnerShare = z.object({
  id: z.string(), label: z.string(), email: z.string().nullable(), perms: z.string(), expires_at: z.string().nullable(), revoked_at: z.string().nullable(),
  views: z.number(), last_access: z.string().nullable(), created_at: z.string(),
  /** activo · vencido · quitado (como estadoDe de la web). */
  estado: z.enum(["activo", "vencido", "quitado"]),
})
export type OwnerShare = z.infer<typeof OwnerShare>
export const NewShare = z.object({
  label: z.string().trim().min(1, "Escribe el nombre de tu contador").max(80),
  email: z.union([z.email("Correo inválido"), z.literal("")]).default(""),
  perms: z.enum(["renta", "todo"], { error: "Permiso inválido (renta o todo)" }),
  exp: z.enum(["30", "90", "dic", "nunca"], { error: "Vencimiento inválido" }),
})
export const ShareCreated = z.object({ id: z.string(), url: z.string(), msg: z.string(), enviado: z.boolean() })
export const OwnerNote = z.object({ id: z.string(), share_id: z.string(), autor: z.string(), texto: z.string(), created_at: z.string() })
export const NewOwnerNote = z.object({ shareId: Uuid, texto: z.string().trim().min(1, "Escribe la nota").max(2000, "La nota es muy larga (máximo 2.000 caracteres)") })
export const VisibleFile = z.object({ id: z.string(), nombre: z.string(), path: z.string(), mime: z.string(), size: z.number(), year: z.number().nullable(), doc_key: z.string().nullable(), visible_contador: z.boolean(), created_at: z.string() })
export const FilesQuery = z.object({ todos: z.enum(["1", "0"]).optional() })

export const accountantOwnerContract = c.router(
  {
    shares: { method: "GET", path: "/v1/books/:bookId/accountant/shares", pathParams: OwnerBookParams, responses: { ...OWNER_ERRORS, 200: z.array(OwnerShare) }, summary: "Accesos creados para contadores (sin el enlace: solo se muestra al crearlo)" },
    createShare: { method: "POST", path: "/v1/books/:bookId/accountant/shares", pathParams: OwnerBookParams, body: NewShare, responses: { ...OWNER_ERRORS, 200: ApiOk(ShareCreated) }, summary: "Crea un acceso de solo lectura y, si hay correo, se lo envía (límite «contador»; acepta Idempotency-Key)" },
    rotateShare: { method: "POST", path: "/v1/books/:bookId/accountant/shares/:shareId/rotate", pathParams: ShareParams, body: c.noBody(), responses: { ...OWNER_ERRORS, 200: ApiOk(z.object({ url: z.string() })) }, summary: "Enlace nuevo (el anterior deja de servir; reactiva un acceso quitado)" },
    revokeShare: { method: "DELETE", path: "/v1/books/:bookId/accountant/shares/:shareId", pathParams: ShareParams, body: c.noBody(), responses: { ...OWNER_ERRORS, 200: ApiOk(z.object({ msg: z.string() })) }, summary: "Quita el acceso (el enlace deja de funcionar)" },
    notes: { method: "GET", path: "/v1/books/:bookId/accountant/notes", pathParams: OwnerBookParams, responses: { ...OWNER_ERRORS, 200: z.array(OwnerNote) }, summary: "Notas con los contadores del libro, en orden" },
    addNote: { method: "POST", path: "/v1/books/:bookId/accountant/notes", pathParams: OwnerBookParams, body: NewOwnerNote, responses: { ...OWNER_ERRORS, 200: ApiOk(z.object({ saved: z.boolean() })) }, summary: "Nota del titular para un acceso de este libro" },
    files: { method: "GET", path: "/v1/books/:bookId/accountant/files", pathParams: OwnerBookParams, query: FilesQuery, responses: { ...OWNER_ERRORS, 200: z.array(VisibleFile) }, summary: "Documentos que ve el contador (`todos=1`: también los ocultos, para escoger)" },
    setFileVisible: { method: "PATCH", path: "/v1/books/:bookId/accountant/files/:attachmentId", pathParams: AttachmentParams, body: z.object({ visible: z.boolean() }), responses: { ...OWNER_ERRORS, 200: ApiOk(VisibleFile) }, summary: "Muestra u oculta un documento en el portal del contador" },
  },
  { strictStatusCodes: true },
)
