// Plantillas de automatizaciones. Las marcadas `porDefecto` se crean solas en cada libro la primera vez que se abre
// el módulo (clave `plantilla`, sin duplicados). Las que crean movimientos empiezan pausadas, y también las que
// repetirían un aviso que Mirai ya manda solo (pagos próximos y presupuesto: Ajustes › Alertas).
import { CATALOG } from "./catalog"
import { autoLayout } from "./layout"
import type { FlowEdge, FlowNode, Graph, NodeData, NodeKind } from "./types"

export type Template = {
  key: string
  nombre: string
  descripcion: string
  icon: string
  /** Se crea sola en cada libro. */
  porDefecto: boolean
  /** Empieza activa (solo las que no crean ni cambian movimientos). */
  activo: boolean
  premium?: boolean
  graph: Graph
}

const node = (id: string, kind: NodeKind, data: NodeData = {}): FlowNode => ({ id, type: CATALOG[kind].group, kind, data: { ...CATALOG[kind].defaults, ...data }, position: { x: 0, y: 0 } })
const edge = (source: string, target: string, sourceHandle: "si" | "no" | null = null): FlowEdge => ({ id: `${source}-${sourceHandle ?? "o"}-${target}`, source, target, sourceHandle })
const flow = (nodes: FlowNode[], edges: FlowEdge[]) => autoLayout({ nodes, edges })

export const TEMPLATES: Template[] = [
  {
    key: "gasto-alto", nombre: "Aviso cuando un gasto supera $200.000", icon: "receipt", porDefecto: true, activo: true,
    descripcion: "Te avisa cada vez que se registra un gasto grande, para que nada se te pase.",
    graph: flow(
      [node("t", "gasto"), node("c", "monto", { op: "mayor", valor: 200_000 }), node("a", "aviso", { titulo: "Gasto alto: {monto}", mensaje: "Se registró un gasto de {monto} en {descripcion} ({categoria}).", canales: "app" })],
      [edge("t", "c"), edge("c", "a", "si")],
    ),
  },
  {
    key: "ahorro-ingreso", nombre: "Ahorra el 10 % de cada ingreso en tu meta", icon: "piggy-bank", porDefecto: true, activo: false,
    descripcion: "Cada vez que recibes plata, aparta el 10 % para tu meta. Elige la meta y actívala.",
    graph: flow(
      [node("t", "ingreso", { fuente: "todos" }), node("a", "apartar", { pct: 10, destino: "meta", goal_id: null }), node("n", "aviso", { titulo: "Apartaste para tu meta", mensaje: "De tu ingreso de {monto} ({descripcion}) apartamos el 10 % para tu meta. ¡Bien!", canales: "app" })],
      [edge("t", "a"), edge("a", "n")],
    ),
  },
  {
    key: "recordatorio-pagos", nombre: "Recordatorio 3 días antes de cada pago", icon: "bell-ring", porDefecto: true, activo: false,
    descripcion: "Tres días antes de un gasto fijo, la tarjeta, una cuota o una suscripción, te recuerda tenerlo listo. Mirai ya te avisa de tus pagos (Ajustes › Alertas): actívala solo si quieres un recordatorio extra.",
    graph: flow(
      [node("t", "pago_proximo", { dias: 3 }), node("a", "aviso", { titulo: "{pago} vence {cuando}", mensaje: "Ten listos {monto} para {pago}. La fecha es el {fecha}.", canales: "todos" })],
      [edge("t", "a")],
    ),
  },
  {
    key: "presupuesto-80", nombre: "Alerta de presupuesto al 80 %", icon: "chart-pie", porDefecto: true, activo: false,
    descripcion: "Cuando una categoría llega al 80 % de lo que presupuestaste para el mes, te avisa a tiempo. Úsala si quieres un aviso a otro porcentaje del que tienes en Ajustes › Alertas.",
    graph: flow(
      [node("t", "presupuesto", { pct: 80, category_id: null }), node("a", "aviso", { titulo: "Vas en el {pct} % de {descripcion}", mensaje: "Llevas {monto} de {tope} este mes. Frena un poco para no pasarte.", canales: "app" })],
      [edge("t", "a")],
    ),
  },
  {
    key: "resumen-semanal", nombre: "Resumen semanal los lunes", icon: "calendar-clock", porDefecto: true, activo: false,
    descripcion: "Cada lunes a las 7 a. m. te manda cuánto gastaste en la semana y cuánto te queda del mes.",
    graph: flow(
      [node("t", "programado", { frecuencia: "semanal", dia_semana: 1, hora: 7 }), node("a", "aviso", { titulo: "Tu semana en Mirai", mensaje: "{resumen}", canales: "todos" })],
      [edge("t", "a")],
    ),
  },
  {
    key: "hormiga", nombre: "Gasto hormiga: avísame y márcalo", icon: "coffee", porDefecto: true, activo: false,
    descripcion: "Cuando Mirai detecta un gasto hormiga, lo marca para tu resumen y te avisa.",
    graph: flow(
      [node("t", "hormiga"), node("m", "marcar_hormiga"), node("a", "aviso", { titulo: "Ojo con el gasto hormiga", mensaje: "{descripcion} por {monto}. Los gastos pequeños, sumados, pesan mucho al final del mes.", canales: "app" })],
      [edge("t", "m"), edge("m", "a")],
    ),
  },
  {
    key: "quincena-fijos", nombre: "Quincena: aparta para gastos fijos", icon: "house", porDefecto: true, activo: false,
    descripcion: "En cada quincena te recuerda cuánto apartar para tus gastos fijos y lo lleva a una meta. Elige la meta y actívala.",
    graph: flow(
      [
        node("t", "programado", { frecuencia: "quincena", hora: 8 }),
        node("a", "aviso", { titulo: "Llegó la quincena", mensaje: "Aparta {fijos} para tus gastos fijos de esta quincena antes de gastar en otra cosa.", canales: "todos" }),
        node("m", "movimiento", { tipo: "meta", modo: "fijos", descripcion: "Apartado para gastos fijos", goal_id: null }),
      ],
      [edge("t", "a"), edge("a", "m")],
    ),
  },
  // ── Solo en la galería ──
  {
    key: "fin-de-semana", nombre: "Fin de semana: cuida los gustos", icon: "calendar-days", porDefecto: false, activo: false,
    descripcion: "Si un sábado o domingo gastas más de $100.000, te manda un recordatorio amable.",
    graph: flow(
      [node("t", "gasto"), node("f", "fecha", { modo: "semana", dias: [6, 0] }), node("c", "monto", { op: "mayor", valor: 100_000 }), node("a", "aviso", { titulo: "Fin de semana movido", mensaje: "Gastaste {monto} en {descripcion}. Revisa si te alcanza para el resto del mes.", canales: "app" })],
      [edge("t", "f"), edge("f", "c", "si"), edge("c", "a", "si")],
    ),
  },
  {
    key: "compra-grande", nombre: "Compra grande: ¿valió la pena?", icon: "hourglass", porDefecto: false, activo: false,
    descripcion: "Después de un gasto de más de $500.000, espera 3 días y te pregunta si valió la pena.",
    graph: flow(
      [node("t", "gasto"), node("c", "monto", { op: "mayor", valor: 500_000 }), node("w", "esperar", { dias: 3 }), node("a", "aviso", { titulo: "¿Valió la pena?", mensaje: "Hace 3 días gastaste {monto} en {descripcion}. Si fue un impulso, anótalo en tu lista de deseos la próxima vez.", canales: "app" })],
      [edge("t", "c"), edge("c", "w", "si"), edge("w", "a")],
    ),
  },
  {
    key: "domicilios", nombre: "Domicilios: categoriza y marca", icon: "search", porDefecto: false, activo: false,
    descripcion: "Si la descripción dice Rappi, domicilio o iFood, le pone la categoría que elijas y lo marca como hormiga.",
    graph: flow(
      [node("t", "gasto"), node("c", "texto", { contiene: "rappi, domicilio, ifood, didi food" }), node("k", "categorizar", { category_id: "" }), node("m", "marcar_hormiga")],
      [edge("t", "c"), edge("c", "k", "si"), edge("k", "m")],
    ),
  },
  {
    key: "meta-cumplida", nombre: "Celebra cuando cumples una meta", icon: "trophy", porDefecto: false, activo: false,
    descripcion: "Te felicita cuando llegas al valor de cualquier meta de ahorro.",
    graph: flow(
      [node("t", "meta_alcanzada"), node("a", "aviso", { titulo: "¡Cumpliste “{meta}”!", mensaje: "Llegaste a {monto}. Date un gusto pequeño y piensa en tu próxima meta.", canales: "todos" })],
      [edge("t", "a")],
    ),
  },
  {
    key: "cuota-pagada", nombre: "Avísame cuando se pague una cuota", icon: "hand-coins", porDefecto: false, activo: false,
    descripcion: "Cada vez que se registra una cuota o un abono de un préstamo (lo que pagas o lo que te pagan), avisa a todo el hogar.",
    graph: flow(
      [node("t", "cuota", { dir: "todas" }), node("a", "aviso", { titulo: "Cuota registrada: {monto}", mensaje: "Se registró un pago de {monto} de {descripcion} el {fecha}.", canales: "app", para: "hogar" })],
      [edge("t", "a")],
    ),
  },
  {
    key: "tarjeta-grande", nombre: "Compra grande con tarjeta de crédito", icon: "credit-card", porDefecto: false, activo: false,
    descripcion: "Si alguien hace una compra de más de $300.000 con una tarjeta de crédito, te avisa para que no te sorprenda el extracto.",
    graph: flow(
      [node("t", "compra_tarjeta"), node("c", "monto", { op: "mayor", valor: 300_000 }), node("a", "aviso", { titulo: "Compra con tarjeta: {monto}", mensaje: "{descripcion} con la {tarjeta} por {monto}. Recuerda que se paga en el próximo corte.", canales: "app", para: "hogar" })],
      [edge("t", "c"), edge("c", "a", "si")],
    ),
  },
  {
    key: "suscripcion-cobrada", nombre: "Aviso cuando se cobra una suscripción", icon: "repeat", porDefecto: false, activo: false,
    descripcion: "Cuando marcas una suscripción como cobrada (Netflix, Spotify…), te dice cuánto fue y te invita a revisar si la sigues usando.",
    graph: flow(
      [node("t", "suscripcion", { evento: "cobrada" }), node("a", "aviso", { titulo: "Se cobró {descripcion}", mensaje: "Pagaste {monto} de {descripcion}. ¿La sigues usando? Si no, cancélala antes del próximo cobro.", canales: "app", para: "autor" })],
      [edge("t", "a")],
    ),
  },
  {
    key: "debito-automatico", nombre: "Débito automático: marca un fijo como pagado", icon: "circle-check", porDefecto: false, activo: false,
    descripcion: "Si un gasto fijo se paga solo del banco (débito automático), Mirai lo marca como pagado el día que elijas. Elige el gasto fijo y el día, y actívala.",
    graph: flow(
      [node("t", "programado", { frecuencia: "mensual", dia_mes: 5, hora: 8 }), node("p", "pagar_fijo", { fixed_expense_id: "", valor: "fijo" }), node("a", "aviso", { titulo: "Registramos tu débito automático", mensaje: "Marcamos tu gasto fijo como pagado. Revisa en tu banco que el cobro sí salió.", canales: "app", para: "hogar" })],
      [edge("t", "p"), edge("p", "a")],
    ),
  },
  {
    key: "fondo-bajo", nombre: "Fondo de emergencia bajo", icon: "life-buoy", porDefecto: false, activo: false, premium: true,
    descripcion: "Si tu fondo de emergencia baja del 30 % de su meta, te avisa y la IA te da un consejo para recuperarlo.",
    graph: flow(
      [node("t", "saldo_bajo", { tipo: "fondo", pct: 30 }), node("a", "aviso", { titulo: "Tu fondo está bajo", mensaje: "Tu fondo de emergencia va en el {pct} % de su meta ({meta}).", canales: "app" }), node("i", "ia", { pregunta: "Mi fondo de emergencia está bajo. ¿Cómo lo recupero sin descuadrar mi mes?" })],
      [edge("t", "a"), edge("a", "i")],
    ),
  },
  {
    key: "consejo-mensual", nombre: "Consejo de la IA cada mes", icon: "sparkles", porDefecto: false, activo: false, premium: true,
    descripcion: "El primer día de cada mes, la IA revisa tus números y te manda un consejo corto.",
    graph: flow(
      [node("t", "programado", { frecuencia: "mensual", dia_mes: 1, hora: 8 }), node("i", "ia", { pregunta: "¿Cómo me fue el mes pasado y qué debo cuidar este mes?", canales: "todos" })],
      [edge("t", "i")],
    ),
  },
]

export const DEFAULT_TEMPLATES = TEMPLATES.filter((t) => t.porDefecto)
export const templateByKey = (k: string) => TEMPLATES.find((t) => t.key === k)

/** Fila lista para insertar en `automations` desde una plantilla. */
export function automationFromTemplate(t: Template, opts: { asDefault?: boolean; activo?: boolean } = {}) {
  const trigger = t.graph.nodes.find((n) => n.type === "trigger")!
  return {
    nombre: t.nombre, descripcion: t.descripcion, icon: t.icon, disparador: trigger.kind, grafo: t.graph,
    activo: opts.activo ?? (opts.asDefault ? t.activo : false), plantilla: opts.asDefault ? t.key : null,
  }
}
