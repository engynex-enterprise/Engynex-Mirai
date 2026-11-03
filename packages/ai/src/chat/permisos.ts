// Qué puede registrar cada rol del hogar desde el chat. Puro (servidor, navegador y pruebas).
// Usa la misma matriz de lib/household/roles.ts que los formularios:
// - "Registra sus gastos" (registra) solo agrega gastos e ingresos propios (OWN_ROW_TABLES).
// - Colabora, Administra y el dueño (editor y superiores) registran en todos los módulos.
// - "Solo mira" (viewer) solo consulta.
import { can, type AccessRole, type Perm } from "@mirai/domain/household/roles"
import { PROPUESTA_TIPOS, type PropuestaTipo } from "./types"

/** Permiso que exige cada tipo de propuesta. */
export const PERM_PROPUESTA: Record<PropuestaTipo, Perm> = {
  gasto: "registrarPropio",
  ingreso: "registrarPropio",
  ingreso_fijo: "registrarPropio",
  fijo: "planear",
  pago_fijo: "editarTodo",
  suscripcion: "planear",
  cobro_suscripcion: "editarTodo",
  compra_tarjeta: "editarTodo",
  pago_tarjeta: "editarTodo",
  prestamo: "planear",
  pago_cuota: "editarTodo",
  meta: "planear",
  abono_meta: "editarTodo",
  recordatorio: "planear",
}

/** ¿Este rol puede proponer (y confirmar) este tipo de registro? */
export const puedeProponer = (r: AccessRole, tipo: PropuestaTipo) => can(r, PERM_PROPUESTA[tipo])

/** Tipos que este rol puede registrar desde el chat. */
export const tiposDelRol = (r: AccessRole): PropuestaTipo[] => PROPUESTA_TIPOS.filter((t) => puedeProponer(r, t))

/** ¿Puede registrar algo desde el chat? (sugerencias "Registra…", adjuntar facturas). */
export const registraAlgo = (r: AccessRole) => can(r, "registrarPropio")

/** Nombre del registro para los mensajes ("tu rol no permite registrar préstamos"). */
export const NOMBRE_TIPO: Record<PropuestaTipo, string> = {
  gasto: "gastos", ingreso: "ingresos", ingreso_fijo: "ingresos fijos", fijo: "gastos fijos", pago_fijo: "pagos de gastos fijos",
  suscripcion: "suscripciones", cobro_suscripcion: "cobros de suscripciones", compra_tarjeta: "compras con tarjeta", pago_tarjeta: "pagos de tarjetas",
  prestamo: "préstamos ni deudas", pago_cuota: "pagos de cuotas", meta: "metas", abono_meta: "abonos a metas", recordatorio: "recordatorios",
}

/** Mensaje amable cuando el rol no alcanza. */
export function sinPermiso(r: AccessRole, tipo: PropuestaTipo): string {
  if (r === "viewer") return "Tu rol en este hogar es **Solo mira**: puedes consultar todo, pero no registrar movimientos. Pídele al dueño del hogar que te dé permiso."
  return `Tu rol en este hogar (**Registra sus gastos**) te deja anotar tus gastos e ingresos, pero no ${NOMBRE_TIPO[tipo]}. Pídele a quien administra el hogar que lo registre o que te cambie el rol.`
}
