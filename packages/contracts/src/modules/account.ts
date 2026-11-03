// Módulo `account` (docs/arquitectura/v6-separacion-front-back.md §2.6). Dueño: F2-I.
// Endpoints: /v1/account: cuentas conectadas, cambio de correo, sesiones, actividad de seguridad, cerrar todas las
// sesiones y borrar la cuenta (Ley 1581). Equivalen a features/account/actions.ts y deleteAccount de
// features/data/actions.ts en apps/web, con los mismos mensajes. Pasar el hogar, salir y borrar el hogar están en
// `households`.
import { initContract } from "@ts-rest/core"
import { z } from "zod"
import { ApiError, ApiOk, COMMON_ERRORS, Uuid } from "../common"
import { AccessRole, Msg } from "./households"

export const meta = { id: "account", owner: "F2-I" } as const

export const ACCOUNT_ERRORS = { ...COMMON_ERRORS, 409: ApiError, 502: ApiError } as const

export const Identity = z.object({ id: z.string(), provider: z.string(), email: z.string().nullable(), last_sign_in_at: z.string().nullable(), created_at: z.string().nullable() })
/** Lo que devuelve la función SQL my_account() (AccountState de @mirai/domain/account). */
export const AccountState = z.object({
  email: z.string().nullable(),
  new_email: z.string().nullable(),
  email_change_sent_at: z.string().nullable(),
  email_change_confirm_status: z.number(),
  has_password: z.boolean(),
  created_at: z.string().nullable(),
  last_sign_in_at: z.string().nullable(),
  identities: z.array(Identity),
})
export const SessionRow = z.object({ id: z.string(), created_at: z.string(), last_active: z.string().nullable(), user_agent: z.string().nullable(), ip: z.string().nullable(), aal: z.string().nullable(), actual: z.boolean() })
export type SessionRow = z.infer<typeof SessionRow>
export const AccountEvent = z.object({ id: z.union([z.number(), z.string()]), kind: z.string(), detail: z.record(z.string(), z.unknown()).nullable(), created_at: z.string(), ip: z.string().nullable().optional(), user_agent: z.string().nullable().optional() })
export const TransferView = z.object({ id: z.string(), householdId: z.string(), hogar: z.string(), de: z.string(), para: z.string(), fromRole: AccessRole, planAction: z.enum(["seguir", "cancelar"]), expiresAt: z.string(), createdAt: z.string() })
export const MyHousehold = z.object({ id: z.string(), nombre: z.string(), access: AccessRole, active: z.boolean(), personas: z.number(), firstBook: z.string().nullable(), outgoing: TransferView.nullable() })
export const AccountData = z.object({ account: AccountState, sessions: z.array(SessionRow), events: z.array(AccountEvent), households: z.array(MyHousehold), incoming: z.array(TransferView) })
export type AccountData = z.infer<typeof AccountData>

export const AccountQuery = z.object({ householdId: Uuid.optional() })
export const EmailChange = z.object({ email: z.string().max(320) })
/** `prueba`: correo de prueba (.test, example.com): no se envió nada de verdad. */
export const EmailChanged = Msg.extend({ prueba: z.boolean() })
export const IdentityParams = z.object({ identityId: Uuid })
export const SessionParams = z.object({ sessionId: Uuid })
export const DeleteAccount = z.object({ confirm: z.string().max(320) })
/**
 * V7-G: exportMyData (Ley 1581, derecho de acceso). Mismo JSON que descarga la web: perfil, preferencias,
 * consentimientos, hogares, reglas de aviso, dispositivos push, Telegram y los libros (completos donde eres Dueño o
 * Administra; en los demás solo lo que registraste).
 */
const Rows = z.array(z.record(z.string(), z.unknown()))
const AnyRow = z.record(z.string(), z.unknown()).nullable()
export const MyDataExport = z.object({
  exportado: z.string(),
  cuenta: z.object({ email: z.string() }),
  perfil: AnyRow,
  preferencias: AnyRow,
  consentimientos: Rows,
  hogares: Rows,
  avisos: Rows,
  dispositivos_push: Rows,
  telegram: AnyRow,
  libros: z.array(z.record(z.string(), z.unknown())),
})
export type MyDataExport = z.infer<typeof MyDataExport>

const c = initContract()
export const accountContract = c.router(
  {
    get: { method: "GET", path: "/v1/account", query: AccountQuery, responses: { ...ACCOUNT_ERRORS, 200: AccountData }, summary: "Tu cuenta: formas de entrar, sesiones, actividad, hogares y solicitudes de dueño (`householdId`: el activo)" },
    requestEmailChange: { method: "POST", path: "/v1/account/email-change", body: EmailChange, responses: { ...ACCOUNT_ERRORS, 200: ApiOk(EmailChanged) }, summary: "Pide cambiar el correo (enlace al correo nuevo)" },
    resendEmailChange: { method: "POST", path: "/v1/account/email-change/resend", body: c.noBody(), responses: { ...ACCOUNT_ERRORS, 200: ApiOk(EmailChanged) }, summary: "Reenvía el enlace del cambio pendiente" },
    cancelEmailChange: { method: "DELETE", path: "/v1/account/email-change", body: c.noBody(), responses: { ...ACCOUNT_ERRORS, 200: ApiOk(Msg) }, summary: "Cancela el cambio de correo pendiente" },
    removePassword: { method: "DELETE", path: "/v1/account/methods/password", body: c.noBody(), responses: { ...ACCOUNT_ERRORS, 200: ApiOk(Msg) }, summary: "Quita la contraseña (nunca la última forma de entrar; pide haber entrado hace poco: 409 details.reason = 'reauth')" },
    removeGoogle: { method: "DELETE", path: "/v1/account/methods/google/:identityId", pathParams: IdentityParams, body: c.noBody(), responses: { ...ACCOUNT_ERRORS, 200: ApiOk(Msg) }, summary: "Desconecta una cuenta de Google (mismas reglas)" },
    sessions: { method: "GET", path: "/v1/account/sessions", responses: { ...ACCOUNT_ERRORS, 200: z.array(SessionRow) }, summary: "Sesiones abiertas (my_sessions)" },
    revokeSession: { method: "DELETE", path: "/v1/account/sessions/:sessionId", pathParams: SessionParams, body: c.noBody(), responses: { ...ACCOUNT_ERRORS, 200: ApiOk(Msg) }, summary: "Cierra una sesión de otro dispositivo" },
    signOutEverywhere: { method: "POST", path: "/v1/account/sign-out-all", body: c.noBody(), responses: { ...ACCOUNT_ERRORS, 200: ApiOk(Msg) }, summary: "Cierra la sesión en todos los dispositivos, incluido este" },
    exportMyData: { method: "GET", path: "/v1/account/export", responses: { ...ACCOUNT_ERRORS, 200: MyDataExport }, summary: "Todos tus datos personales en JSON (Ley 1581): perfil, preferencias, hogares, avisos y libros (completos donde eres Dueño o Administra)" },
    remove: { method: "DELETE", path: "/v1/account", body: DeleteAccount, responses: { ...ACCOUNT_ERRORS, 200: ApiOk(Msg) }, summary: "Elimina la cuenta y los hogares donde eres la única persona (409 details.hogares si eres dueño de un hogar con más personas)" },
  },
  { strictStatusCodes: true },
)
