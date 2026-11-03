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
import { ApiOk, COMMON_ERRORS } from "../common"

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
