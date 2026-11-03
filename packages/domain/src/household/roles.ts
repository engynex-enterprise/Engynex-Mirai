// Roles del hogar con nombres sencillos y su matriz de permisos. Isomórfico (cliente, servidor y pruebas).
//
// En la base: household_members.access_role guarda el rol fino (owner, admin, editor, registra, viewer) y
// household_members.role conserva el nivel que conoce la versión publicada (owner, editor, viewer). Un trigger los
// mantiene sincronizados (migración 20261103000900_hogar_roles.sql) y la RLS usa access_role con role_rank().

export const ACCESS_ROLES = ["owner", "admin", "editor", "registra", "viewer"] as const
export type AccessRole = (typeof ACCESS_ROLES)[number]
/** Niveles que conoce la versión publicada (columna `role`). */
export type LegacyRole = "owner" | "editor" | "viewer"

export type RoleInfo = { k: AccessRole; label: string; short: string; desc: string; icon: string; ideal: string }

/** Nombre, descripción en palabras simples e ícono de cada rol (orden: de más a menos permisos). */
export const ROLE_INFO: Record<AccessRole, RoleInfo> = {
  owner: { k: "owner", label: "Dueño del hogar", short: "Dueño", icon: "crown", ideal: "Quien creó el hogar", desc: "Puede hacer todo: invitar, cambiar roles, el plan y borrar el hogar. Solo hay uno y puede pasarle el hogar a otra persona." },
  admin: { k: "admin", label: "Administra", short: "Administra", icon: "shield-check", ideal: "Tu pareja", desc: "Puede hacer todo, menos borrar el hogar, pasárselo a otra persona o cambiar el plan. Puede invitar personas." },
  editor: { k: "editor", label: "Colabora", short: "Colabora", icon: "pencil", ideal: "Quien te ayuda con las cuentas", desc: "Registra y edita gastos, ingresos, presupuestos y metas. No invita personas ni cambia los ajustes del hogar." },
  registra: { k: "registra", label: "Registra sus gastos", short: "Registra sus gastos", icon: "receipt", ideal: "Tus hijos", desc: "Solo agrega y edita sus propios gastos e ingresos, y ve los totales del hogar. No cambia lo que registran los demás." },
  viewer: { k: "viewer", label: "Solo mira", short: "Solo mira", icon: "eye", ideal: "Quien solo quiere estar al tanto", desc: "Ve todo el hogar, pero no puede cambiar nada." },
}

/** Rango para comparar (el mismo de role_rank() en la base). */
export const ROLE_RANK: Record<AccessRole, number> = { owner: 50, admin: 40, editor: 30, registra: 20, viewer: 10 }

/** Nivel que ve la versión publicada para cada rol nuevo. */
export const legacyRole = (r: AccessRole): LegacyRole => (r === "owner" ? "owner" : r === "admin" || r === "editor" ? "editor" : "viewer")

/** Rol fino a partir de lo que trae la base (filas viejas sin access_role usan role). */
export function toAccess(access: string | null | undefined, role?: string | null): AccessRole {
  const v = String(access || role || "").trim()
  return (ACCESS_ROLES as readonly string[]).includes(v) ? (v as AccessRole) : "viewer"
}

export const atLeast = (r: AccessRole, min: AccessRole) => ROLE_RANK[r] >= ROLE_RANK[min]

// ── Permisos ──────────────────────────────────────────────────────────────────────────────────────────────────
export const PERMS = {
  ver: "Ver los gastos, ingresos y totales del hogar",
  registrarPropio: "Registrar sus propios gastos e ingresos",
  editarTodo: "Registrar y editar todos los movimientos",
  planear: "Presupuestos, metas, gastos fijos y deudas",
  invitar: "Invitar, agregar y quitar personas",
  roles: "Cambiar el rol de los demás",
  ajustes: "Ajustes del hogar, integraciones y respaldos",
  plan: "Cambiar o pagar el plan",
  borrar: "Borrar el hogar o pasárselo a otra persona",
} as const
export type Perm = keyof typeof PERMS

/** Rol mínimo de cada permiso. */
const MIN: Record<Perm, AccessRole> = {
  ver: "viewer", registrarPropio: "registra", editarTodo: "editor", planear: "editor",
  invitar: "admin", roles: "admin", ajustes: "admin", plan: "owner", borrar: "owner",
}

/** ¿Este rol puede hacer esto? */
export const can = (r: AccessRole, p: Perm) => atLeast(r, MIN[p])

/** Tabla "¿Qué puede hacer cada rol?": una fila por permiso y una columna por rol. */
export const ROLE_MATRIX = (Object.keys(PERMS) as Perm[]).map((p) => ({ perm: p, label: PERMS[p], roles: Object.fromEntries(ACCESS_ROLES.map((r) => [r, can(r, p)])) as Record<AccessRole, boolean> }))

/** Mensaje para un botón desactivado ("Tu rol no permite…"). */
export const deniedMsg = (p: Perm) => `Tu rol no permite ${PERMS[p].charAt(0).toLowerCase()}${PERMS[p].slice(1)}.`

/** Roles que alguien puede dar al invitar o al cambiar un rol (el dueño se pasa con "Pasarle el hogar"). */
export function assignableRoles(actor: AccessRole): AccessRole[] {
  if (!can(actor, "roles")) return []
  return (["admin", "editor", "registra", "viewer"] as AccessRole[]).filter((r) => ROLE_RANK[r] <= ROLE_RANK[actor])
}

/**
 * ¿Puede `actor` cambiar el rol de (o sacar a) alguien con rol `target`? Nadie cambia al dueño salvo otro dueño
 * (hogares viejos con dos dueños). Uno mismo no cambia su rol aquí (el dueño pasa el hogar; los demás pueden salir).
 */
export function canManage(actor: AccessRole, target: AccessRole, self = false) {
  if (self || !can(actor, "roles")) return false
  if (target === "owner") return actor === "owner"
  return ROLE_RANK[target] <= ROLE_RANK[actor]
}

/** ¿Puede editar este registro? (los de "Registra sus gastos" solo editan lo que ellos crearon). */
export const canEditRow = (r: AccessRole, row: { created_by?: string | null } | null | undefined, userId: string) =>
  can(r, "editarTodo") || (can(r, "registrarPropio") && !!row?.created_by && row.created_by === userId)

/** Tablas en las que "Registra sus gastos" puede escribir sus propias filas (políticas RLS de la migración). */
export const OWN_ROW_TABLES = ["expenses", "incomes", "extra_incomes"] as const
