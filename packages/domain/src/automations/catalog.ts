// Catálogo de pasos (nodos) de las automatizaciones: nombre, ayuda, ícono, valores iniciales y resumen legible.
// Isomórfico: lo usan el editor, la simulación y el servidor.
import { formatCOP } from "../money"
import { DIAS_SEMANA } from "../reparto"
import type { FlowNode, NodeData, NodeGroup, NodeKind, Refs } from "./types"

export type CatalogItem = { group: NodeGroup; label: string; desc: string; icon: string; premium?: boolean; defaults: NodeData }

export const GROUPS: Record<NodeGroup, { label: string; plural: string; desc: string; icon: string }> = {
  trigger: { label: "Disparador", plural: "Disparadores", desc: "Lo que pone a andar la automatización", icon: "zap" },
  condition: { label: "Condición", plural: "Condiciones", desc: "Una pregunta con dos caminos: Sí o No", icon: "split" },
  action: { label: "Acción", plural: "Acciones", desc: "Lo que Mirai hace por ti", icon: "wand-sparkles" },
}

export const CATALOG: Record<NodeKind, CatalogItem> = {
  // ── Disparadores ──
  gasto: { group: "trigger", label: "Se registra un gasto", desc: "Cada vez que anotas un gasto (o entra del correo, un extracto o Telegram).", icon: "receipt", defaults: {} },
  ingreso: { group: "trigger", label: "Recibes un ingreso", desc: "Cuando anotas un ingreso extra o llega el día de pago de tu sueldo.", icon: "arrow-down-to-line", defaults: { fuente: "todos" } },
  pago_fijo: { group: "trigger", label: "Pagas un gasto fijo", desc: "Cuando marcas como pagado un gasto fijo (arriendo, servicios…).", icon: "house", defaults: {} },
  cuota: { group: "trigger", label: "Se paga una cuota", desc: "Cuando registras el pago de una cuota o un abono de un préstamo: lo que tú pagas (Le debo) o lo que te pagan (Me deben).", icon: "hand-coins", defaults: { dir: "todas" } },
  compra_tarjeta: { group: "trigger", label: "Compras con tarjeta de crédito", desc: "Cada vez que anotas una compra en una de tus tarjetas de crédito.", icon: "credit-card", defaults: { card_id: null } },
  suscripcion: { group: "trigger", label: "Una suscripción", desc: "Cuando se cobra una suscripción (Netflix, Spotify…) o agregas una nueva.", icon: "repeat", defaults: { evento: "cobrada" } },
  recordatorio: { group: "trigger", label: "Agregas un recordatorio", desc: "Cuando alguien agrega un recordatorio o una fecha a la agenda.", icon: "calendar-plus", defaults: {} },
  programado: { group: "trigger", label: "En una fecha", desc: "Cada día, cada semana, cada mes, en la quincena o el día de pago.", icon: "calendar-clock", defaults: { frecuencia: "semanal", dia_semana: 1, dia_mes: 1, hora: 7 } },
  presupuesto: { group: "trigger", label: "Presupuesto al límite", desc: "Cuando una categoría llega a un porcentaje de su presupuesto del mes.", icon: "chart-pie", defaults: { pct: 80, category_id: null } },
  hormiga: { group: "trigger", label: "Gasto hormiga", desc: "Cuando Mirai detecta un gasto pequeño que se repite (tinto, domicilio, mecato…).", icon: "coffee", defaults: {} },
  pago_proximo: { group: "trigger", label: "Pago que se acerca", desc: "Unos días antes de un gasto fijo, tarjeta, cuota de préstamo o suscripción.", icon: "bell-ring", defaults: { dias: 3, tipos: ["fijo", "tarjeta", "pagar", "sub"] } },
  saldo_bajo: { group: "trigger", label: "Saldo o fondo bajo", desc: "Cuando tu fondo de emergencia o lo que te queda del mes baja de un nivel.", icon: "life-buoy", defaults: { tipo: "fondo", pct: 30, valor: 200000 } },
  meta_alcanzada: { group: "trigger", label: "Meta cumplida", desc: "Cuando llegas al valor de una meta de ahorro.", icon: "trophy", defaults: { goal_id: null } },
  // ── Condiciones ──
  monto: { group: "condition", label: "Si el monto…", desc: "Compara el valor del movimiento con un monto.", icon: "scale", defaults: { op: "mayor", valor: 200000 } },
  categoria: { group: "condition", label: "Si la categoría es…", desc: "Revisa si el movimiento es de ciertas categorías.", icon: "tag", defaults: { category_ids: [] } },
  miembro: { group: "condition", label: "Si es de…", desc: "Revisa qué persona de la familia hizo el movimiento.", icon: "users", defaults: { member_id: "" } },
  fecha: { group: "condition", label: "Si el día es…", desc: "Revisa el día de la semana o la quincena.", icon: "calendar-days", defaults: { modo: "semana", dias: [6, 0], quincena: "q1" } },
  texto: { group: "condition", label: "Si la descripción dice…", desc: "Busca palabras en la descripción (separa varias con coma).", icon: "search", defaults: { contiene: "" } },
  // ── Acciones ──
  aviso: { group: "action", label: "Enviar un aviso", desc: "En la app y por los canales que cada persona tenga activos (correo, Telegram, push, WhatsApp), a todo el hogar o a una persona.", icon: "bell", defaults: { titulo: "Aviso de Mirai", mensaje: "", canales: "app", para: "hogar" } },
  movimiento: { group: "action", label: "Crear un movimiento", desc: "Registra un gasto, un ahorro en tu fondo o un aporte a una meta.", icon: "arrow-left-right", defaults: { tipo: "meta", modo: "pct", valor: 0, pct: 10, descripcion: "Ahorro automático", category_id: null, goal_id: null } },
  crear_ingreso: { group: "action", label: "Registrar un ingreso", desc: "Anota un ingreso extra: un valor fijo o un porcentaje del monto (por ejemplo, la cuota que te pagaron).", icon: "arrow-down-to-line", defaults: { modo: "pct", valor: 0, pct: 100, descripcion: "{descripcion}", category_id: null } },
  pagar_fijo: { group: "action", label: "Marcar un gasto fijo como pagado", desc: "Registra el pago del periodo pendiente de un gasto fijo (queda en tus gastos, como cuando tocas Pagar).", icon: "circle-check", defaults: { fixed_expense_id: "", valor: "fijo" } },
  categorizar: { group: "action", label: "Asignar categoría", desc: "Le pone una categoría al gasto que disparó la automatización.", icon: "tag", defaults: { category_id: "" } },
  apartar: { group: "action", label: "Apartar un %", desc: "Aparta un porcentaje del monto para una meta o tu fondo de emergencia.", icon: "piggy-bank", defaults: { pct: 10, destino: "meta", goal_id: null } },
  agenda: { group: "action", label: "Agregar a la agenda", desc: "Crea un recordatorio en tu calendario dentro de unos días.", icon: "calendar-plus", defaults: { titulo: "Recordatorio", dias: 1, usar_monto: false } },
  marcar_hormiga: { group: "action", label: "Marcar como hormiga", desc: "Marca el gasto como gasto hormiga para que lo veas en su resumen.", icon: "flag", defaults: {} },
  esperar: { group: "action", label: "Esperar", desc: "Espera unos días antes de seguir con el siguiente paso.", icon: "hourglass", defaults: { dias: 1 } },
  ia: { group: "action", label: "Pedir un consejo a la IA", desc: "La inteligencia artificial mira tus números y te manda un consejo corto.", icon: "sparkles", premium: true, defaults: { pregunta: "¿Cómo voy este mes y qué puedo mejorar?", canales: "app", para: "hogar" } },
}

export const KINDS_BY_GROUP: Record<NodeGroup, NodeKind[]> = {
  trigger: (Object.keys(CATALOG) as NodeKind[]).filter((k) => CATALOG[k].group === "trigger"),
  condition: (Object.keys(CATALOG) as NodeKind[]).filter((k) => CATALOG[k].group === "condition"),
  action: (Object.keys(CATALOG) as NodeKind[]).filter((k) => CATALOG[k].group === "action"),
}

export const FRECUENCIAS = [
  { value: "diario", label: "Cada día" },
  { value: "semanal", label: "Cada semana" },
  { value: "mensual", label: "Cada mes" },
  { value: "quincena", label: "Cada quincena (15 y fin de mes)" },
  { value: "dia_pago", label: "El día que te pagan" },
] as const

export const TIPOS_PAGO = [
  { value: "fijo", label: "Gastos fijos" },
  { value: "tarjeta", label: "Tarjetas de crédito" },
  { value: "pagar", label: "Cuotas de préstamos" },
  { value: "sub", label: "Suscripciones" },
] as const

/** Variables que se pueden usar en los textos: {monto}, {descripcion}… */
export const VARIABLES = [
  { k: "monto", d: "valor del movimiento" },
  { k: "descripcion", d: "descripción o nombre" },
  { k: "categoria", d: "categoría" },
  { k: "miembro", d: "persona de la familia" },
  { k: "fecha", d: "fecha" },
  { k: "resumen", d: "resumen de la semana" },
  { k: "fijos", d: "gastos fijos de la quincena" },
  { k: "pct", d: "porcentaje del presupuesto" },
  { k: "dias", d: "días que faltan" },
  { k: "meta", d: "nombre de la meta" },
  { k: "persona", d: "persona del préstamo" },
  { k: "tarjeta", d: "tarjeta de crédito" },
] as const

/** Opciones de "¿A quién?" en los avisos (además de cada persona con cuenta en el hogar). */
export const PARA = [
  { value: "hogar", label: "Todo el hogar" },
  { value: "autor", label: "Quien hizo el movimiento" },
] as const

export const DIR_CUOTA = [
  { value: "todas", label: "Todas" },
  { value: "pagar", label: "Las que pago (Le debo)" },
  { value: "cobrar", label: "Las que me pagan (Me deben)" },
] as const

export const EVENTOS_SUSCRIPCION = [
  { value: "cobrada", label: "Cuando se cobra" },
  { value: "nueva", label: "Cuando agrego una" },
  { value: "todas", label: "Las dos" },
] as const

const n = (v: unknown) => Number(v ?? 0)
const name = (map: Record<string, string> | undefined, id: unknown, fallback: string): string => (id ? map?.[String(id)] : undefined) || fallback
const lista = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} o ${xs[xs.length - 1]}`)

/** Frase corta de lo que hace el paso con sus datos (se muestra en la tarjeta del diagrama). */
export function summarize(node: Pick<FlowNode, "kind" | "data">, refs: Refs = {}): string {
  const d = node.data
  switch (node.kind) {
    case "gasto": return "Cada gasto que se registre"
    case "ingreso": return d.fuente === "extras" ? "Ingresos extra que anotes" : d.fuente === "nomina" ? "El día que llega tu sueldo" : "Ingresos extra y días de pago"
    case "pago_fijo": return "Cada pago de un gasto fijo"
    case "cuota": return d.dir === "pagar" ? "Cada cuota que pagas (Le debo)" : d.dir === "cobrar" ? "Cada cuota que te pagan (Me deben)" : "Cada cuota o abono de un préstamo"
    case "compra_tarjeta": return "Cada compra con tarjeta de crédito"
    case "suscripcion": return d.evento === "nueva" ? "Cuando agregas una suscripción" : d.evento === "todas" ? "Suscripción nueva o cobrada" : "Cada cobro de una suscripción"
    case "recordatorio": return "Cada recordatorio nuevo en la agenda"
    case "programado": {
      const h = `${n(d.hora) % 12 || 12}:00 ${n(d.hora) < 12 ? "a. m." : "p. m."}`
      if (d.frecuencia === "diario") return `Todos los días a las ${h}`
      if (d.frecuencia === "semanal") return `Cada ${DIAS_SEMANA[n(d.dia_semana)]?.toLowerCase() ?? "lunes"} a las ${h}`
      if (d.frecuencia === "mensual") return `El día ${n(d.dia_mes) || 1} de cada mes a las ${h}`
      if (d.frecuencia === "quincena") return `Cada quincena (15 y fin de mes) a las ${h}`
      return `El día que te pagan a las ${h}`
    }
    case "presupuesto": return `${name(refs.categorias, d.category_id, "Cualquier categoría")} llega al ${n(d.pct)} %`
    case "hormiga": return "Un gasto pequeño que se repite"
    case "pago_proximo": {
      const tipos = Array.isArray(d.tipos) ? (d.tipos as string[]) : []
      const t = tipos.length === 4 ? "cualquier pago" : lista(TIPOS_PAGO.filter((x) => tipos.includes(x.value)).map((x) => x.label.toLowerCase()))
      return n(d.dias) === 0 ? `El día de ${t}` : `${n(d.dias)} día${n(d.dias) === 1 ? "" : "s"} antes de ${t}`
    }
    case "saldo_bajo": return d.tipo === "disponible" ? `Te quedan menos de ${formatCOP(n(d.valor))} este mes` : `Fondo de emergencia por debajo del ${n(d.pct)} %`
    case "meta_alcanzada": return d.goal_id ? `Cumples “${name(refs.metas, d.goal_id, "tu meta")}”` : "Cumples cualquier meta"
    case "monto": return `${d.op === "menor" ? "Menor" : "Mayor"} que ${formatCOP(n(d.valor))}`
    case "categoria": {
      const ids = Array.isArray(d.category_ids) ? (d.category_ids as string[]) : []
      return ids.length ? lista(ids.map((id) => name(refs.categorias, id, "categoría"))) : "Elige categorías"
    }
    case "miembro": return d.member_id ? name(refs.miembros, d.member_id, "Una persona") : "Elige a la persona"
    case "fecha": {
      if (d.modo === "quincena") return d.quincena === "q2" ? "Segunda quincena" : "Primera quincena"
      const dias = Array.isArray(d.dias) ? (d.dias as number[]) : []
      return dias.length ? lista(dias.map((x) => DIAS_SEMANA[x]?.toLowerCase() ?? "")) : "Elige días"
    }
    case "texto": return d.contiene ? `Contiene “${String(d.contiene)}”` : "Escribe palabras"
    case "aviso": return `“${String(d.titulo || "Aviso")}”${d.canales === "todos" ? " · todos tus canales" : " · en la app"}${paraLabel(d.para, refs)}`
    case "crear_ingreso": return `Ingreso de ${d.modo === "pct" ? `${n(d.pct)} % del monto` : formatCOP(n(d.valor))}`
    case "pagar_fijo": return d.fixed_expense_id ? `Pagar “${name(refs.fijos, d.fixed_expense_id, "el gasto fijo")}”${d.valor === "monto" ? " con el monto" : ""}` : "Elige el gasto fijo"
    case "movimiento": {
      const cuanto = d.modo === "pct" ? `${n(d.pct)} % del monto` : d.modo === "fijos" ? "lo de tus gastos fijos" : formatCOP(n(d.valor))
      if (d.tipo === "gasto") return `Gasto de ${cuanto}`
      if (d.tipo === "ahorro") return `Guardar ${cuanto} en el fondo`
      return `Aportar ${cuanto} a “${name(refs.metas, d.goal_id, "elige una meta")}”`
    }
    case "categorizar": return d.category_id ? `Categoría: ${name(refs.categorias, d.category_id, "categoría")}` : "Elige la categoría"
    case "apartar": return `${n(d.pct)} % para ${d.destino === "fondo" ? "tu fondo de emergencia" : `“${name(refs.metas, d.goal_id, "elige una meta")}”`}`
    case "agenda": return `“${String(d.titulo || "Recordatorio")}” en ${n(d.dias)} día${n(d.dias) === 1 ? "" : "s"}`
    case "marcar_hormiga": return "El gasto queda como hormiga"
    case "esperar": return `${n(d.dias)} día${n(d.dias) === 1 ? "" : "s"}`
    case "ia": return `${String(d.pregunta || "Consejo de la IA")}${paraLabel(d.para, refs)}`
  }
}

/** " · a Ana" / " · a quien lo hizo" (vacío si es para todo el hogar). */
function paraLabel(para: unknown, refs: Refs) {
  if (!para || para === "hogar") return ""
  if (para === "autor") return " · a quien lo hizo"
  return ` · a ${name(refs.personas, para, "una persona")}`
}
