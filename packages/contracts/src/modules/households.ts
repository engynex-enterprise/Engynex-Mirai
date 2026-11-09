// Módulo `households` (docs/arquitectura/v6-separacion-front-back.md §2.6). Dueño: F2-I.
// Endpoints: /v1/households: bienvenida (crear el hogar + referidos), nombre, personas, roles, invitaciones, familia,
// pasar el hogar (directo o con aceptación), salir y borrar; /v1/invitations/:token (ver y aceptar) y
// /v1/transfers/:id (responder o cancelar). Equivalen a features/household/actions.ts, features/account/actions.ts
// (titularidad, salir y borrar) y app/(onboarding)/bienvenida/actions.ts de apps/web, con los mismos mensajes.
import { initContract } from "@ts-rest/core"
import { z } from "zod"
import type { Row } from "@mirai/db/tables"
import { ACCESS_ROLES } from "@mirai/domain/household/roles"
import { ApiError, ApiOk, COMMON_ERRORS, IsoDate, Uuid } from "../common"

export const meta = { id: "households", owner: "F2-I" } as const

/** Errores de los comandos del hogar: además de los comunes, plan (límite de personas) y conflicto (duplicados). */
export const HOUSEHOLD_ERRORS = { ...COMMON_ERRORS, 402: ApiError, 409: ApiError, 502: ApiError } as const

export const Msg = z.object({ msg: z.string() })
export type Msg = z.infer<typeof Msg>
export const AccessRole = z.enum(ACCESS_ROLES)
/** Roles que se pueden dar al invitar o al cambiar el rol (el de dueño se pasa con la titularidad). */
export const AssignableRole = z.enum(["admin", "editor", "registra", "viewer"])

export const HouseholdParams = z.object({ householdId: Uuid })
export const InvitationParams = HouseholdParams.extend({ invitationId: Uuid })
export const PersonParams = HouseholdParams.extend({ userId: Uuid })
export const FamilyParams = HouseholdParams.extend({ familyId: Uuid })
export const TransferParams = z.object({ transferId: Uuid })
/** El token de una invitación llega tal cual en la URL (/invitacion/<token>). */
export const TokenParams = z.object({ token: z.string().min(1).max(200) })

// ── Bienvenida ────────────────────────────────────────────────────────────────────────────────────────────────

export const CreateHousehold = z.object({
  nombre: z.string().trim().min(2, "Escribe tu nombre").max(80),
  hogar: z.string().trim().min(2, "Escribe el nombre de tu hogar").max(60),
  libro: z.string().trim().min(2).max(40),
  /** Código de referido (datos del registro o cookie `mirai_ref` que deja /registro?ref=…). */
  ref: z.string().trim().max(40).optional().nullable(),
})
export const Created = z.object({ bookId: z.string(), msg: z.string() })

export const Rename = z.object({ nombre: z.string().max(200) })

// ── Personas ──────────────────────────────────────────────────────────────────────────────────────────────────

export const ChannelResult = z.object({ ok: z.boolean(), at: z.string(), provider: z.string().nullable().optional(), error: z.string().nullable().optional(), via: z.enum(["api", "propio", "prueba"]).optional() })
export const LastResult = z.object({ email: ChannelResult.optional(), whatsapp: ChannelResult.optional(), cancelada: z.string().optional() })
export const Share = z.object({ url: z.string(), text: z.string(), wa: z.string() })
export type Share = z.infer<typeof Share>

export const PersonInvite = z.object({
  id: z.string(),
  kind: z.enum(["email", "tel"]),
  destino: z.string(),
  phone: z.string().nullable(),
  access: AccessRole,
  createdAt: z.string(),
  expiresAt: z.string(),
  estado: z.enum(["pendiente", "vencida"]),
  lastSentAt: z.string().nullable(),
  sendsDay: z.string().nullable(),
  sendsToday: z.number(),
  result: LastResult,
  share: Share.nullable(),
})

/** Fila de `family_members` tal como la guarda la base (la web la usa en el formulario del integrante). */
export const FamilyRow = z.record(z.string(), z.unknown()) as unknown as z.ZodType<Row<"family_members">>

export const Person = z.object({
  key: z.string(),
  familyId: z.string().nullable(),
  userId: z.string().nullable(),
  nombre: z.string(),
  avatar: z.string().nullable(),
  parentesco: z.string().nullable(),
  access: AccessRole.nullable(),
  me: z.boolean(),
  titular: z.boolean(),
  email: z.string().nullable(),
  estado: z.enum(["miembro", "invitado", "vencida", "sin_cuenta"]),
  invite: PersonInvite.nullable(),
  family: FamilyRow.nullable(),
})
export type Person = z.infer<typeof Person>

export const HouseholdPeople = z.object({
  people: z.array(Person),
  sinCuenta: z.array(z.object({ id: z.string(), nombre: z.string(), parentesco: z.string() })),
  limite: z.number().optional(),
})
export type HouseholdPeople = z.infer<typeof HouseholdPeople>

export const InvitePerson = z.object({
  destino: z.string().max(120),
  nombre: z.string().max(60).optional().nullable(),
  parentesco: z.string().max(60).optional().nullable(),
  access: AssignableRole,
  familyId: Uuid.optional().nullable(),
  /** Es otra persona aunque se llame igual que un integrante sin cuenta. */
  nueva: z.boolean().optional(),
})
export type InvitePerson = z.infer<typeof InvitePerson>

/**
 * Invitación creada o reenviada. Los casos que en la web devolvían `code` llegan como error con `details.reason`:
 * "miembro" | "pendiente" (+ invitationId) | "mismo_nombre" (+ familyId) → 409; "limite" → 402; "espera" → 429.
 */
/** Por dónde puede enviar Mirai la invitación (lo demás lo comparte la persona). */
export const InviteChannels = z.object({ email: z.boolean(), whatsapp: z.boolean(), motivoWhatsApp: z.string().optional() })
export type InviteChannels = z.infer<typeof InviteChannels>

export const Invited = z.object({ invitationId: z.string(), share: Share, delivery: LastResult, msg: z.string() })

export const ChangeRole = z.object({ access: AssignableRole })
export const LinkPerson = z.object({ familyId: Uuid })
export const MakeOwner = z.object({ userId: Uuid })
export const Removed = Msg.extend({ self: z.boolean() })

export const FamilyMember = z.object({
  nombre: z.string().trim().min(1, "Escribe el nombre").max(60),
  rol: z.string().trim().max(60).optional().nullable(),
  avatar: z.string().max(500).optional().nullable(),
  nacimiento: IsoDate.optional().nullable(),
  cupo: z.number().min(0).max(1e12).optional(),
  /** Guardar aunque ya haya alguien con el mismo nombre (si no: 409 con details.reason = "mismo_nombre"). */
  force: z.boolean().optional(),
})
export const FamilySaved = Msg.extend({ id: z.string() })
/**
 * V7-H2: cambio parcial de un integrante (Planeación › Familia: el cupo; Renta: dependientes). Solo estos campos; el
 * nombre y el parentesco siguen por updateFamily (que revisa los nombres repetidos).
 */
export const FamilyPatch = z.object({
  cupo: z.number().min(0, "El valor no puede ser negativo").max(1e12),
  doc: z.string().trim().max(40, "Máximo 40 caracteres"),
  dep_de: Uuid.nullable(),
  dep_rel: z.string().trim().max(40, "Máximo 40 caracteres").nullable(),
  nacimiento: IsoDate.nullable(),
  estudia: z.boolean(),
  sin_ingresos: z.boolean(),
  discapacidad: z.boolean(),
}).partial().refine((p) => Object.keys(p).length > 0, "No hay nada para guardar")
export type FamilyPatch = z.infer<typeof FamilyPatch>

// ── Pasar el hogar, salir y borrar ────────────────────────────────────────────────────────────────────────────

export const TransferPerson = z.object({ userId: z.string(), nombre: z.string(), email: z.string().nullable(), avatar: z.string().nullable(), access: AccessRole, ok: z.boolean() })
export const TransferCandidates = z.object({ owner: z.boolean(), msg: z.string(), people: z.array(TransferPerson), tienePago: z.boolean(), hogar: z.string() })
export const RequestTransfer = z.object({
  userId: Uuid,
  fromRole: AssignableRole,
  planAction: z.enum(["seguir", "cancelar"]),
  /** El nombre del hogar escrito para confirmar. */
  confirm: z.string().max(120),
})
export const RespondTransfer = z.object({ accept: z.boolean() })
export const DeleteHousehold = z.object({ confirm: z.string().max(200) })

// ── Invitación pública ────────────────────────────────────────────────────────────────────────────────────────

export const InvitationInfo = z.object({
  estado: z.enum(["pendiente", "vencida", "aceptada", "cancelada", "no_existe"]),
  hogar: z.string().optional(),
  invita: z.string().optional(),
  rol: AccessRole.optional(),
  nombre: z.string().nullable().optional(),
  vence: z.string().optional(),
  ya_miembro: z.boolean().optional(),
})
export type InvitationInfo = z.infer<typeof InvitationInfo>
export const Accepted = z.object({ householdId: z.string(), bookId: z.string().nullable(), ya: z.boolean(), msg: z.string() })

const H = "/v1/households/:householdId"
const c = initContract()
export const householdsContract = c.router(
  {
    create: { method: "POST", path: "/v1/households", body: CreateHousehold, responses: { ...HOUSEHOLD_ERRORS, 200: ApiOk(Created) }, summary: "Bienvenida: crea el hogar y su primer libro (create_household) y reclama el referido" },
    rename: { method: "PATCH", path: H, pathParams: HouseholdParams, body: Rename, responses: { ...HOUSEHOLD_ERRORS, 200: ApiOk(Msg) }, summary: "Cambia el nombre del hogar (permiso «ajustes»)" },
    remove: { method: "DELETE", path: H, pathParams: HouseholdParams, body: DeleteHousehold, responses: { ...HOUSEHOLD_ERRORS, 200: ApiOk(Msg) }, summary: "Borra el hogar con sus libros y archivos (solo el dueño, escribiendo el nombre)" },
    leave: { method: "POST", path: `${H}/leave`, pathParams: HouseholdParams, body: c.noBody(), responses: { ...HOUSEHOLD_ERRORS, 200: ApiOk(Msg) }, summary: "Sale del hogar (no el dueño)" },

    people: { method: "GET", path: `${H}/people`, pathParams: HouseholdParams, responses: { ...HOUSEHOLD_ERRORS, 200: HouseholdPeople }, summary: "Personas con cuenta, integrantes sin cuenta e invitaciones pendientes, en una sola lista" },
    changeRole: { method: "PATCH", path: `${H}/people/:userId/role`, pathParams: PersonParams, body: ChangeRole, responses: { ...HOUSEHOLD_ERRORS, 200: ApiOk(Msg) }, summary: "Cambia el rol de una persona (set_member_access)" },
    removePerson: { method: "DELETE", path: `${H}/people/:userId`, pathParams: PersonParams, body: c.noBody(), responses: { ...HOUSEHOLD_ERRORS, 200: ApiOk(Removed) }, summary: "Quita el acceso de una persona (o sale uno mismo) y cierra sus accesos del contador" },
    linkPerson: { method: "POST", path: `${H}/people/:userId/link`, pathParams: PersonParams, body: LinkPerson, responses: { ...HOUSEHOLD_ERRORS, 200: ApiOk(Msg) }, summary: "Une a una persona con cuenta con el integrante sin cuenta que la representaba" },
    makeOwner: { method: "POST", path: `${H}/owner`, pathParams: HouseholdParams, body: MakeOwner, responses: { ...HOUSEHOLD_ERRORS, 200: ApiOk(Msg) }, summary: "Pasa el hogar directamente (transfer_household)" },

    inviteChannels: { method: "GET", path: `${H}/invitations/channels`, pathParams: HouseholdParams, responses: { ...HOUSEHOLD_ERRORS, 200: InviteChannels }, summary: "Por dónde puede enviar Mirai la invitación (correo y WhatsApp)" },
    invite: { method: "POST", path: `${H}/invitations`, pathParams: HouseholdParams, body: InvitePerson, responses: { ...HOUSEHOLD_ERRORS, 200: ApiOk(Invited) }, summary: "Invita por correo o celular, sin duplicados y con el límite del plan (acepta Idempotency-Key)" },
    resendInvitation: { method: "POST", path: `${H}/invitations/:invitationId/resend`, pathParams: InvitationParams, body: c.noBody(), responses: { ...HOUSEHOLD_ERRORS, 200: ApiOk(Invited) }, summary: "Reenvía (1 cada 10 minutos y 5 al día); si venció la renueva 7 días" },
    shareInvitation: { method: "GET", path: `${H}/invitations/:invitationId/share`, pathParams: InvitationParams, responses: { ...HOUSEHOLD_ERRORS, 200: ApiOk(z.object({ share: Share })) }, summary: "Enlace, texto y wa.me de una invitación pendiente" },
    markInvitationShared: { method: "POST", path: `${H}/invitations/:invitationId/shared`, pathParams: InvitationParams, body: c.noBody(), responses: { ...HOUSEHOLD_ERRORS, 200: ApiOk(Msg) }, summary: "Registra que se abrió WhatsApp con la invitación lista" },
    cancelInvitation: { method: "DELETE", path: `${H}/invitations/:invitationId`, pathParams: InvitationParams, body: c.noBody(), responses: { ...HOUSEHOLD_ERRORS, 200: ApiOk(Msg) }, summary: "Cancela la invitación (el enlace deja de servir)" },

    createFamily: { method: "POST", path: `${H}/family`, pathParams: HouseholdParams, body: FamilyMember, responses: { ...HOUSEHOLD_ERRORS, 200: ApiOk(FamilySaved) }, summary: "Agrega un integrante sin cuenta (permiso «invitar»)" },
    updateFamily: { method: "PUT", path: `${H}/family/:familyId`, pathParams: FamilyParams, body: FamilyMember, responses: { ...HOUSEHOLD_ERRORS, 200: ApiOk(FamilySaved) }, summary: "Edita un integrante (permiso «planear»)" },
    deleteFamily: { method: "DELETE", path: `${H}/family/:familyId`, pathParams: FamilyParams, body: c.noBody(), responses: { ...HOUSEHOLD_ERRORS, 200: ApiOk(Msg) }, summary: "Saca a un integrante sin cuenta (borrado lógico) y cancela su invitación" },
    // V7-H2: integrantes del hogar (useMembers de la web) y cambio parcial (cupo, datos de dependiente).
    family: { method: "GET", path: `${H}/family`, pathParams: HouseholdParams, responses: { ...HOUSEHOLD_ERRORS, 200: z.array(FamilyRow) }, summary: "Integrantes del hogar (sin los borrados), en el orden del hogar" },
    patchFamily: { method: "PATCH", path: `${H}/family/:familyId`, pathParams: FamilyParams, body: FamilyPatch, responses: { ...HOUSEHOLD_ERRORS, 200: ApiOk(FamilySaved) }, summary: "Cambia el cupo o los datos de dependiente de un integrante (permiso «planear»)" },
    restoreFamily: { method: "POST", path: `${H}/family/:familyId/restore`, pathParams: FamilyParams, body: c.noBody(), responses: { ...HOUSEHOLD_ERRORS, 200: ApiOk(Msg) }, summary: "Deshacer: el integrante vuelve al hogar" },

    transferCandidates: { method: "GET", path: `${H}/transfer/candidates`, pathParams: HouseholdParams, responses: { ...HOUSEHOLD_ERRORS, 200: TransferCandidates }, summary: "Quiénes pueden recibir el hogar y si pagas una renovación automática" },
    requestTransfer: { method: "POST", path: `${H}/transfer`, pathParams: HouseholdParams, body: RequestTransfer, responses: { ...HOUSEHOLD_ERRORS, 200: ApiOk(Msg) }, summary: "Pide pasar el hogar (queda pendiente 7 días hasta que la persona acepte)" },
    respondTransfer: { method: "POST", path: "/v1/transfers/:transferId/respond", pathParams: TransferParams, body: RespondTransfer, responses: { ...HOUSEHOLD_ERRORS, 200: ApiOk(Msg) }, summary: "Acepta o rechaza ser el dueño" },
    cancelTransfer: { method: "DELETE", path: "/v1/transfers/:transferId", pathParams: TransferParams, body: c.noBody(), responses: { ...HOUSEHOLD_ERRORS, 200: ApiOk(Msg) }, summary: "Cancela la solicitud de pasar el hogar" },

    invitationInfo: { method: "GET", path: "/v1/invitations/:token", pathParams: TokenParams, responses: { ...COMMON_ERRORS, 200: InvitationInfo }, summary: "Datos de la invitación (sin sesión; con sesión dice si ya eres miembro)" },
    acceptInvitation: { method: "POST", path: "/v1/invitations/:token/accept", pathParams: TokenParams, body: c.noBody(), responses: { ...HOUSEHOLD_ERRORS, 200: ApiOk(Accepted) }, summary: "Acepta la invitación con la sesión actual (accept_invitation, idempotente)" },
  },
  { strictStatusCodes: true },
)
