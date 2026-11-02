// Tipos de deuda (Le debo) y de préstamo (Me deben): qué campos se muestran, cuáles son obligatorios, sus textos y sus
// valores por defecto. Todo puro: el formulario (features/loans/loan-form.tsx) solo dibuja lo que esto decide.
// La columna `loans.tipo` es nueva: en los préstamos de antes se deduce de entity_id, prenda, fiado y contact_id.

export type LoanKindT = "cobrar" | "pagar"
export type LoanTipo = "banco" | "empeno" | "fiado" | "persona" | "cuotas" | "gota" | "presto" | "vendi" | "otro"
/** Cómo se paga: cuotas fijas, una sola fecha o abonos libres (pago único con una fecha aproximada). */
export type PagoModo = "cuotas" | "unico" | "libre"
/** Qué dato del interés se conoce. */
export type InteresModo = "no" | "tasa" | "cuota"
/**
 * Quién presta (o a quién le prestaste):
 * ent = banco o entidad · casa = casa de empeño (entidad o nombre escrito) · prov = tienda o almacén (proveedor)
 * ct = una persona (contacto guardado o nuevo) · nombre = solo un nombre (opcional) · libre = entidad o persona.
 */
export type QuienModo = "ent" | "casa" | "prov" | "ct" | "nombre" | "libre"
export type SistemaT = "frances" | "aleman" | "simple" | "americano" | "sin"

export interface TipoDef {
  value: LoanTipo
  kind: LoanKindT | "ambos"
  label: string
  desc: string
  icon: string
  /** Texto corto para la lista y las etiquetas ("Fiado", "Empeño"). */
  corto: string
  /** Aviso fuerte al escogerlo (gota a gota). */
  riesgo?: string
}

export const LOAN_TIPOS: TipoDef[] = [
  { value: "banco", kind: "pagar", label: "Banco, cooperativa o financiera", corto: "Crédito", icon: "landmark", desc: "Crédito de consumo, libre inversión, vehículo, vivienda o libranza." },
  { value: "empeno", kind: "pagar", label: "Empeño", corto: "Empeño", icon: "gem", desc: "En una casa de empeño o compraventa: dejas un objeto en garantía." },
  { value: "fiado", kind: "pagar", label: "Fiado en una tienda o negocio", corto: "Fiado", icon: "store", desc: "La tienda, el almacén o el negocio te deja llevar y pagar después." },
  { value: "persona", kind: "pagar", label: "Préstamo de una persona", corto: "Préstamo", icon: "handshake", desc: "Un familiar, un amigo o un conocido te prestó." },
  { value: "cuotas", kind: "pagar", label: "Compra a cuotas en un almacén", corto: "Compra a cuotas", icon: "shopping-bag", desc: "Electrodomésticos, celular, muebles: pagas en cuotas, a veces con intereses." },
  {
    value: "gota", kind: "pagar", label: "Gota a gota o prestamista", corto: "Gota a gota", icon: "triangle-alert",
    desc: "Préstamo informal que se paga a diario. Suele cobrar mucho más de lo que permite la ley.",
    riesgo: "Los préstamos gota a gota casi siempre cobran más que la tasa de usura (eso es ilegal en Colombia) y a veces se cobran con amenazas. Si puedes, cámbialo por un crédito en una cooperativa, un banco o tu fondo de empleados. Regístralo aquí para ver cuánto te está costando de verdad.",
  },
  { value: "presto", kind: "cobrar", label: "Le presté a una persona", corto: "Préstamo", icon: "hand-coins", desc: "Un familiar, un amigo o un conocido te debe plata que le prestaste." },
  { value: "vendi", kind: "cobrar", label: "Le fié a un cliente", corto: "Venta fiada", icon: "shopping-cart", desc: "Vendiste algo y te lo pagan después (vendiste fiado)." },
  { value: "otro", kind: "ambos", label: "Otro", corto: "Otra", icon: "circle-ellipsis", desc: "Cualquier otra deuda: el colegio, la constructora, un saldo pendiente." },
]

export const tipoDef = (t: LoanTipo | null | undefined): TipoDef | undefined => LOAN_TIPOS.find((x) => x.value === t)

/** Tipos que se ofrecen en Le debo (pagar) o en Me deben (cobrar), en el orden de las tarjetas. */
export function tiposDe(kind: LoanKindT): TipoDef[] {
  return LOAN_TIPOS.filter((t) => t.kind === kind || t.kind === "ambos")
}

export const esTipo = (v: unknown, kind?: LoanKindT): v is LoanTipo =>
  typeof v === "string" && LOAN_TIPOS.some((t) => t.value === v && (!kind || t.kind === kind || t.kind === "ambos"))

/** Tipo de un préstamo guardado. Si no lo tiene (datos de antes), se deduce de sus columnas. */
export function loanTipo(L: {
  tipo?: string | null; kind?: string | null; prenda?: unknown; fiado?: boolean | null
  entity_id?: string | null; contact_id?: string | null
}): LoanTipo {
  const kind: LoanKindT = L.kind === "cobrar" ? "cobrar" : "pagar"
  if (esTipo(L.tipo, kind)) return L.tipo
  if (kind === "cobrar") return L.contact_id ? "presto" : "otro"
  if (L.prenda) return "empeno"
  if (L.fiado) return "fiado"
  if (L.entity_id) return "banco"
  if (L.contact_id) return "persona"
  return "otro"
}

/** Clases de crédito con el banco: cambian el nombre sugerido y el plazo por defecto. */
export const TIPOS_CREDITO = [
  { value: "consumo", label: "Consumo", concepto: "Crédito de consumo", plazo: 36, icon: "shopping-bag" },
  { value: "libre", label: "Libre inversión", concepto: "Crédito de libre inversión", plazo: 60, icon: "wallet" },
  { value: "vehiculo", label: "Vehículo", concepto: "Crédito de vehículo", plazo: 60, icon: "car" },
  { value: "vivienda", label: "Vivienda", concepto: "Crédito de vivienda", plazo: 180, icon: "house" },
  { value: "libranza", label: "Libranza", concepto: "Crédito de libranza", plazo: 72, icon: "briefcase" },
] as const

/** Interés mensual habitual de una casa de empeño (el mismo que usa el Consejero). */
export const TASA_EMPENO = 4

export interface TipoDefaults {
  pago: PagoModo
  interes: InteresModo
  frec: string
  plazo: number
  sistema: SistemaT
  /** Interés mensual (%) sugerido; vacío si no hay uno habitual. */
  tasa: string
}

/** Valores con los que arranca cada tipo (los de Ajustes › Finanzas › Préstamos cuando aplica). */
export function tipoDefaults(tipo: LoanTipo, kind: LoanKindT, defs: { sistema?: string; frec?: string; plazo?: number } = {}): TipoDefaults {
  const sis = (["frances", "aleman", "simple", "americano"].includes(defs.sistema ?? "") ? defs.sistema : "frances") as SistemaT
  const frec = defs.frec && defs.frec !== "unico" ? defs.frec : "mensual"
  const plazo = defs.plazo && defs.plazo > 0 ? defs.plazo : 12
  switch (tipo) {
    case "banco": return { pago: "cuotas", interes: "cuota", frec: "mensual", plazo: 36, sistema: sis, tasa: "" }
    case "empeno": return { pago: "cuotas", interes: "tasa", frec: "mensual", plazo: 4, sistema: "americano", tasa: String(TASA_EMPENO) }
    case "fiado": return { pago: "unico", interes: "no", frec: "mensual", plazo: 1, sistema: "simple", tasa: "" }
    case "persona": return { pago: "cuotas", interes: "no", frec, plazo, sistema: "simple", tasa: "" }
    case "cuotas": return { pago: "cuotas", interes: "cuota", frec: "mensual", plazo: 12, sistema: "frances", tasa: "" }
    case "gota": return { pago: "cuotas", interes: "cuota", frec: "diariohab", plazo: 30, sistema: "simple", tasa: "" }
    case "presto": return { pago: "cuotas", interes: "no", frec, plazo, sistema: "simple", tasa: "" }
    case "vendi": return { pago: "unico", interes: "no", frec: "mensual", plazo: 1, sistema: "simple", tasa: "" }
    default: return { pago: "cuotas", interes: kind === "cobrar" ? "no" : "tasa", frec, plazo, sistema: sis, tasa: "" }
  }
}

export interface Campos {
  /** Lectura con foto (extracto, pagaré o factura) con IA. */
  foto: boolean
  quien: QuienModo
  /** Chips de clase de crédito (banco). */
  tipoCredito: boolean
  /** "¿Para qué fue?" / "¿Qué compraste?". El empeño usa el objeto como concepto. */
  concepto: boolean
  /** Cuota inicial (compra a cuotas). */
  inicial: boolean
  /** Formas de pago que se ofrecen (si es una sola, no se pregunta). */
  pagos: PagoModo[]
  /** Frecuencias de las cuotas (vacío = no se pregunta). */
  frecs: string[]
  plazo: boolean
  vence: boolean
  /** Modos de interés que se ofrecen (si es uno solo, no se pregunta). */
  intereses: InteresModo[]
  /** Escoger cómo se calcula la cuota (francés, alemán, simple, americano). */
  sistema: boolean
  /** Tasa efectiva anual como alternativa a la mensual. */
  ea: boolean
  /** Seguros y otros cobros por cuota. */
  extra: boolean
  /** Objeto en garantía: obligatorio (empeño), opcional o no aplica. */
  prenda: "si" | "opcional" | "no"
  /** Pagos anteriores a Mirai. */
  hist: boolean
  /** Nota del acuerdo. */
  nota: boolean
  /** Ofrecer el acuerdo de pago en PDF (con una persona). */
  pdf: boolean
}

const PAGOS_TIPO: Record<LoanTipo, PagoModo[]> = {
  banco: ["cuotas"], empeno: ["cuotas"], fiado: ["unico", "libre"], persona: ["unico", "cuotas", "libre"], cuotas: ["cuotas"],
  gota: ["cuotas"], presto: ["unico", "cuotas", "libre"], vendi: ["unico", "cuotas", "libre"], otro: ["unico", "cuotas", "libre"],
}
const INTERES_TIPO: Record<LoanTipo, InteresModo[]> = {
  banco: ["cuota", "tasa"], empeno: ["tasa"], fiado: ["no", "tasa"], persona: ["no", "tasa", "cuota"], cuotas: ["cuota", "tasa", "no"],
  gota: ["cuota", "tasa"], presto: ["no", "tasa", "cuota"], vendi: ["no", "tasa"], otro: ["no", "tasa", "cuota"],
}
const TODAS = ["mensual", "quincenal", "semanal", "diario", "diariohab"]
const FRECS_TIPO: Record<LoanTipo, string[]> = {
  banco: ["mensual", "quincenal"], empeno: [], fiado: [], persona: TODAS, cuotas: ["mensual", "quincenal", "semanal"],
  gota: ["diariohab", "diario", "semanal"], presto: TODAS, vendi: ["mensual", "quincenal", "semanal"], otro: TODAS,
}
const QUIEN_TIPO: Record<LoanTipo, QuienModo> = {
  banco: "ent", empeno: "casa", fiado: "prov", persona: "ct", cuotas: "prov", gota: "nombre", presto: "ct", vendi: "ct", otro: "libre",
}

/** Qué campos se muestran para el tipo, la forma de pago y el modo de interés escogidos. */
export function camposLoan(tipo: LoanTipo, kind: LoanKindT, st: { pago?: PagoModo; interes?: InteresModo } = {}): Campos {
  const pagos = PAGOS_TIPO[tipo]
  const pago = st.pago && pagos.includes(st.pago) ? st.pago : pagos[0]
  const cuotas = pago === "cuotas"
  // Sin cuotas no hay "valor de la cuota" que dar: solo un porcentaje o nada.
  const intereses = INTERES_TIPO[tipo].filter((m) => cuotas || m !== "cuota")
  const interes = st.interes && intereses.includes(st.interes) ? st.interes : intereses[0]
  const pagar = kind === "pagar"
  return {
    foto: tipo === "banco" || tipo === "cuotas" || tipo === "otro",
    quien: QUIEN_TIPO[tipo],
    tipoCredito: tipo === "banco",
    concepto: tipo !== "empeno",
    inicial: tipo === "cuotas",
    pagos,
    frecs: cuotas ? FRECS_TIPO[tipo] : [],
    plazo: cuotas,
    vence: !cuotas,
    intereses,
    sistema: cuotas && interes === "tasa" && (tipo === "banco" || tipo === "persona" || tipo === "cuotas" || tipo === "presto" || tipo === "otro"),
    ea: interes === "tasa" && (tipo === "banco" || tipo === "cuotas" || tipo === "otro"),
    extra: pagar && cuotas && (tipo === "banco" || tipo === "cuotas"),
    prenda: tipo === "empeno" ? "si" : tipo === "presto" || tipo === "otro" ? "opcional" : "no",
    hist: cuotas,
    nota: tipo === "persona" || tipo === "presto" || tipo === "vendi" || tipo === "gota" || tipo === "otro",
    pdf: tipo === "persona" || tipo === "presto" || tipo === "vendi",
  }
}

/** Sistema de la cuota que se guarda: el escogido solo cuando se pregunta; si no, el propio del tipo. */
export function sistemaDe(tipo: LoanTipo, interes: InteresModo, escogido: SistemaT, campos: Campos): SistemaT {
  if (interes === "no") return "sin"
  if (interes === "cuota") return "frances"
  if (tipo === "empeno") return "americano"
  if (campos.sistema) return escogido
  return tipo === "banco" || tipo === "cuotas" ? "frances" : "simple"
}

export interface LoanFormState {
  tipo: LoanTipo | null
  kind: LoanKindT
  /** Persona: contacto guardado o nuevo. Otro (Le debo): también banco o entidad. */
  quien?: "ent" | "ex" | "new"
  entity?: string | null
  contact?: string | null
  nombreNuevo?: string
  prov?: string | null
  /** Nombre escrito (casa de empeño sin entidad, prestamista). */
  acreedor?: string
  monto: number
  inicial?: number
  pago?: PagoModo
  interes?: InteresModo
  tasa?: number
  ea?: number
  cuota?: number
  plazo?: number
  inicio: string
  vence?: string | null
  obj?: string
}

export type Faltante = { campo: string; msg: string }

/** Lo que falta para poder guardar (el primero se muestra en el botón inactivo). */
export function faltantesLoan(s: LoanFormState): Faltante[] {
  const out: Faltante[] = []
  if (!s.tipo) return [{ campo: "tipo", msg: s.kind === "cobrar" ? "Escoge el tipo de préstamo" : "Escoge el tipo de deuda" }]
  const c = camposLoan(s.tipo, s.kind, s)
  const pago = s.pago && c.pagos.includes(s.pago) ? s.pago : c.pagos[0]
  const interes = s.interes && c.intereses.includes(s.interes) ? s.interes : c.intereses[0]
  const persona = (q: "ex" | "new" | "ent" | undefined) =>
    q === "new" ? (!s.nombreNuevo?.trim() ? "Escribe el nombre de la persona" : "") : q === "ent" ? (!s.entity ? "Escoge el banco o la entidad" : "") : !s.contact ? "Escoge el contacto" : ""
  const quienMsg = c.quien === "ent" ? (!s.entity ? "Escoge el banco o la entidad" : "")
    : c.quien === "casa" ? (!s.entity && !s.acreedor?.trim() ? "Escoge o escribe la casa de empeño" : "")
    : c.quien === "prov" ? (!s.prov ? (s.tipo === "cuotas" ? "Escoge el almacén" : "Escoge la tienda o el negocio") : "")
    : c.quien === "ct" ? persona(s.quien === "ent" ? "ex" : s.quien)
    : c.quien === "libre" ? persona(s.kind === "cobrar" && s.quien === "ent" ? "ex" : s.quien)
    : ""
  if (quienMsg) out.push({ campo: "quien", msg: quienMsg })
  if (c.prenda === "si" && !s.obj?.trim()) out.push({ campo: "obj", msg: "Escribe qué objeto dejaste" })
  const financiado = s.monto - (c.inicial ? s.inicial || 0 : 0)
  if (!(s.monto > 0)) out.push({ campo: "monto", msg: "Escribe el valor" })
  else if (!(financiado > 0)) out.push({ campo: "inicial", msg: "La cuota inicial debe ser menor que el valor de la compra" })
  if (pago === "cuotas" && !(Math.round(s.plazo ?? 0) >= 1)) out.push({ campo: "plazo", msg: "Escribe en cuántas cuotas" })
  if (pago !== "cuotas" && !(s.vence && s.vence > s.inicio)) out.push({ campo: "vence", msg: "La fecha del pago debe ser después de la fecha de inicio" })
  if (interes === "cuota" && !((s.cuota ?? 0) > 0)) out.push({ campo: "cuota", msg: "Escribe el valor de la cuota" })
  if (interes === "tasa" && !((s.tasa ?? 0) > 0) && !((s.ea ?? 0) > 0)) out.push({ campo: "tasa", msg: "Escribe el interés" })
  return out
}

export interface TextosLoan {
  titulo: string
  quien: string
  quienHint: string
  monto: string
  montoHint?: string
  concepto: string
  conceptoPh: string
  inicio: string
  pago: string
  vence: string
  venceHint: string
  plazo: string
  cuota: string
  interes: string
  interesItems: Partial<Record<InteresModo, { label: string; desc?: string }>>
  hist: string
  boton: string
  toast: string
  /** Encabezado del resumen ("Resumen de la deuda"). */
  recibo: string
  /** "Te prestó" / "Le prestaste" en el resumen. */
  quienRecibo: string
  total: string
}

/** Etiquetas, ayudas y botones propios de cada tipo (y de la frecuencia escogida). */
export function textosLoan(tipo: LoanTipo | null, kind: LoanKindT, st: { frec?: string; pago?: PagoModo } = {}): TextosLoan {
  const C = kind === "cobrar"
  const diaria = st.frec === "diario" || st.frec === "diariohab"
  const per = st.frec === "quincenal" ? "quincena" : st.frec === "semanal" ? "semana" : diaria ? "día" : "mes"
  const libre = st.pago === "libre"
  const base: TextosLoan = {
    titulo: C ? "Registrar un préstamo que hiciste" : "Registrar una deuda",
    quien: C ? "¿A quién le prestaste?" : "¿Quién te prestó?",
    quienHint: "",
    monto: C ? "¿Cuánto le prestaste?" : "¿Cuánto te prestaron?",
    concepto: "¿Para qué fue?", conceptoPh: "Ej. Arreglo del carro",
    inicio: C ? "¿Cuándo le prestaste?" : "Fecha del préstamo",
    pago: C ? "¿Cómo te paga?" : "¿Cómo lo pagas?",
    vence: libre ? "¿Para cuándo más o menos?" : C ? "¿Cuándo te paga?" : "¿Cuándo lo pagas?",
    venceHint: libre ? "Una fecha aproximada para terminar. Registras cada abono cuando llegue." : "La fecha que acordaron para pagar todo de una vez. Te avisamos antes.",
    plazo: "¿En cuántas cuotas?",
    cuota: `Valor de cada cuota`,
    interes: C ? "¿Le cobras intereses?" : "¿Cobra intereses?",
    interesItems: { no: { label: "No" }, tasa: { label: "Sí, sé el porcentaje" }, cuota: { label: "Sí, sé cuánto es la cuota" } },
    hist: C ? "¿Ya te ha pagado algo?" : "¿Ya has pagado algo?",
    boton: C ? "Registrar préstamo" : "Registrar deuda",
    toast: C ? "Préstamo registrado." : "Deuda registrada.",
    recibo: C ? "Resumen del préstamo" : "Resumen de la deuda",
    quienRecibo: C ? "Le prestaste a" : "Te prestó",
    total: C ? "RECIBIRÁS EN TOTAL" : "PAGARÁS EN TOTAL",
  }
  switch (tipo) {
    case "banco": return {
      ...base, titulo: "Registrar un crédito", quien: "¿Qué banco o entidad te prestó?", quienHint: "Banco, cooperativa, fondo de empleados o financiera.",
      monto: "¿Cuánto te prestaron?", montoHint: "El valor que te desembolsaron, sin intereses.", inicio: "Fecha del desembolso",
      plazo: st.frec === "quincenal" ? "Plazo en quincenas" : "Plazo en meses", cuota: st.frec === "quincenal" ? "Cuota quincenal" : "Cuota mensual",
      interes: "¿Qué dato tienes del crédito?", interesItems: { cuota: { label: "Sé la cuota", desc: "La que aparece en tu extracto o en la app del banco" }, tasa: { label: "Sé la tasa", desc: "Efectiva anual (E.A.) o mensual" } },
      hist: "¿Ya has pagado cuotas?", recibo: "Resumen del crédito", quienRecibo: "Entidad",
    }
    case "empeno": return {
      ...base, titulo: "Registrar un empeño", quien: "Casa de empeño o compraventa", quienHint: "Escógela de tus entidades o escribe su nombre.",
      monto: "¿Cuánto te prestaron sobre el objeto?", montoHint: "Lo que te entregaron, no lo que vale el objeto.", inicio: "Fecha del empeño",
      plazo: "¿Por cuántos meses?", hist: "¿Ya has pagado intereses?", boton: "Registrar empeño", toast: "Empeño registrado.",
      recibo: "Resumen del empeño", quienRecibo: "Casa de empeño",
    }
    case "fiado": return {
      ...base, titulo: "Registrar un fiado", quien: "Tienda o negocio", quienHint: "Escoge el negocio de tus proveedores o escribe el nombre para agregarlo.",
      monto: "¿Cuánto fue lo que te fiaron?", montoHint: "El valor de la compra fiada.", concepto: "¿Qué compraste?", conceptoPh: "Ej. Mercado de la semana",
      inicio: "Fecha de la compra", interes: "¿Te cobran algún recargo?", interesItems: { no: { label: "No, solo lo que compré" }, tasa: { label: "Sí, un porcentaje al mes" } },
      boton: "Registrar fiado", toast: "Fiado registrado.", recibo: "Resumen del fiado", quienRecibo: "Te fió",
    }
    case "persona": return {
      ...base, titulo: "Registrar un préstamo de una persona", quien: "¿Quién te prestó?", monto: "¿Cuánto te prestó?",
      conceptoPh: "Ej. Matrícula de la universidad", vence: libre ? base.vence : "¿Cuándo le pagas?", interes: "¿Acordaron intereses?",
      cuota: `¿De cuánto es cada cuota?`,
    }
    case "cuotas": return {
      ...base, titulo: "Registrar una compra a cuotas", quien: "Almacén o tienda", quienHint: "Escógelo de tus proveedores o escribe el nombre para agregarlo.",
      monto: "Valor de la compra", montoHint: "El precio de lo que compraste, de contado.", concepto: "¿Qué compraste?", conceptoPh: "Ej. Nevera, celular, colchón",
      inicio: "Fecha de la compra", interes: "¿Qué dato tienes?",
      interesItems: { cuota: { label: "Sé el valor de la cuota" }, tasa: { label: "Sé la tasa de interés" }, no: { label: "Sin intereses", desc: "Pagas el valor en partes iguales" } },
      boton: "Registrar compra", toast: "Compra a cuotas registrada.", recibo: "Resumen de la compra", quienRecibo: "Almacén",
    }
    case "gota": return {
      ...base, titulo: "Registrar un préstamo gota a gota", quien: "¿Cómo se llama o cómo le dicen?", quienHint: "Opcional: para reconocerlo en tu lista.",
      inicio: "¿Cuándo te prestaron?", plazo: diaria ? "¿Cuántos días de pago?" : "¿Cuántas cuotas?", cuota: diaria ? "¿Cuánto pagas cada día?" : `¿Cuánto pagas cada ${per}?`,
      interes: "¿Qué te dijeron?", interesItems: { cuota: { label: "Sé cuánto pago en cada cuota" }, tasa: { label: "Sé el porcentaje" } },
      quienRecibo: "Prestamista",
    }
    case "presto": return { ...base, quien: "¿A quién le prestaste?", conceptoPh: "Ej. Arreglo de la moto", cuota: "¿De cuánto es cada cuota?" }
    case "vendi": return {
      ...base, titulo: "Registrar una venta fiada", quien: "¿A quién le fiaste?", monto: "¿Cuánto te quedó debiendo?", montoHint: "Lo que falta por pagarte de la venta.",
      concepto: "¿Qué le vendiste?", conceptoPh: "Ej. Mercancía, un celular", inicio: "Fecha de la venta", interes: "¿Le cobras algún recargo?",
      interesItems: { no: { label: "No" }, tasa: { label: "Sí, un porcentaje al mes" } }, boton: "Registrar venta fiada", toast: "Venta fiada registrada.",
      recibo: "Resumen de la venta fiada", quienRecibo: "Cliente",
    }
    case "otro": return {
      ...base, quien: C ? "¿Quién te debe?" : "¿Con quién es la deuda?", monto: C ? "¿Cuánto te deben?" : "¿Cuánto debes?",
      concepto: C ? "¿De qué es?" : "¿De qué es la deuda?", conceptoPh: "Ej. Matrícula del colegio", inicio: "¿Desde cuándo?",
      quienRecibo: C ? "Te debe" : "Le debes a",
    }
    default: return base
  }
}

/** Texto de la deuda para la lista y el detalle: "Fiado en Tienda X", "Empeño: reloj", "Crédito con Bancolombia". */
export function loanTitulo(tipo: LoanTipo, nombre: string, L: { concepto?: string | null; prenda?: { obj?: string } | null }): string {
  const obj = L.prenda?.obj?.trim()
  switch (tipo) {
    case "banco": return `Crédito con ${nombre}`
    case "empeno": return `Empeño: ${obj || L.concepto || "objeto en garantía"}`
    case "fiado": return `Fiado en ${nombre}`
    case "persona": return `Préstamo de ${nombre}`
    case "cuotas": return `Compra a cuotas en ${nombre}`
    case "gota": return `Gota a gota · ${nombre}`
    case "presto": return `Le prestaste a ${nombre}`
    case "vendi": return `Venta fiada a ${nombre}`
    default: return nombre
  }
}
