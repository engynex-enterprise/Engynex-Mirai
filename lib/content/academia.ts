// Academia Mirai: lecciones cortas de finanzas personales en palabras simples, con una pregunta de repaso.
// El avance se guarda en user_preferences.extra.academia (ids de las lecciones terminadas).

export type Nivel = "basico" | "intermedio" | "avanzado"
export type Leccion = {
  id: string; titulo: string; minutos: number; icon: string; puntos: string[]
  pregunta: { q: string; opciones: string[]; correcta: number; porque: string }
  ir?: { href: string; label: string }
  /** Nivel de la lección (por defecto, básico). */
  nivel?: Nivel
  /** Términos del glosario relacionados (ids de lib/content/glosario.ts). */
  glosario?: string[]
}

export const NIVELES: Record<Nivel, { label: string; desc: string; icon: string }> = {
  basico: { label: "Básico", desc: "Ordena tu plata del día a día", icon: "sprout" },
  intermedio: { label: "Intermedio", desc: "Créditos, tarjetas y tu nómina", icon: "trending-up" },
  avanzado: { label: "Avanzado", desc: "Invertir e impuestos", icon: "graduation-cap" },
}

export const LECCIONES: Leccion[] = [
  {
    id: "presupuesto", nivel: "basico", glosario: ["presupuesto-503020"], titulo: "El presupuesto 50/30/20", minutos: 3, icon: "chart-pie",
    puntos: ["Divide lo que te entra en tres partes: 50 % para lo necesario (arriendo, comida, servicios), 30 % para gustos y 20 % para ahorrar o pagar deudas.", "No es una regla rígida: es un punto de partida. Si tu arriendo se lleva más, recorta en gustos, no en ahorro.", "Lo importante es decidir a dónde va la plata antes de gastarla, no al final del mes."],
    pregunta: { q: "Si te ganas $2.000.000, ¿cuánto deberías apartar para ahorrar o pagar deudas según la regla?", opciones: ["$200.000", "$400.000", "$1.000.000"], correcta: 1, porque: "El 20 % de $2.000.000 es $400.000." }, ir: { href: "/presupuesto", label: "Arma tu presupuesto" },
  },
  {
    id: "emergencia", nivel: "basico", glosario: ["fondo-emergencia"], titulo: "Tu fondo de emergencia", minutos: 3, icon: "shield-check",
    puntos: ["Es plata guardada solo para imprevistos: una enfermedad, quedarte sin trabajo o un daño en la casa.", "La meta es tener entre 3 y 6 meses de tus gastos necesarios. Empieza con una meta pequeña, como un mes.", "Guárdalo en una cuenta aparte que rinda algo y que puedas sacar rápido, no en efectivo en la casa."],
    pregunta: { q: "¿Para qué NO debería usarse el fondo de emergencia?", opciones: ["Una cirugía inesperada", "Las vacaciones de fin de año", "Quedarse sin trabajo"], correcta: 1, porque: "Las vacaciones se planean: para eso es una meta de ahorro, no la emergencia." }, ir: { href: "/metas", label: "Crea tu fondo" },
  },
  {
    id: "hormiga", nivel: "basico", glosario: ["gasto-hormiga"], titulo: "Los gastos hormiga", minutos: 2, icon: "coffee",
    puntos: ["Son gastos pequeños y frecuentes: el tinto, el domicilio, el paquete del semáforo. Uno solo no pesa; juntos sí.", "Un gasto de $8.000 al día son unos $240.000 al mes y casi $3.000.000 al año.", "No se trata de quitártelos todos, sino de elegir cuáles de verdad disfrutas."],
    pregunta: { q: "Un gasto hormiga de $10.000 diarios, ¿cuánto suma más o menos en un año?", opciones: ["$365.000", "$1.200.000", "$3.650.000"], correcta: 2, porque: "$10.000 × 365 días = $3.650.000." }, ir: { href: "/gastos", label: "Revisa tus gastos hormiga" },
  },
  {
    id: "tasas", nivel: "intermedio", glosario: ["tasa-ea", "usura"], titulo: "Tasas de interés sin enredos", minutos: 4, icon: "percent",
    puntos: ["La tasa efectiva anual (E.A.) es la que te dice cuánto pagas o ganas en un año completo. Úsala para comparar.", "La tasa de usura es el máximo que la ley permite cobrar en Colombia; la publica la Superfinanciera cada mes.", "En un crédito, mira el costo total: la cuota por el número de meses, más seguros y cuotas de manejo."],
    pregunta: { q: "¿Qué tasa sirve para comparar dos créditos?", opciones: ["La tasa mensual vencida", "La tasa efectiva anual (E.A.)", "La que tenga la cuota más baja"], correcta: 1, porque: "La E.A. incluye el efecto de los intereses sobre intereses en un año." }, ir: { href: "/calculadoras", label: "Calcula un crédito" },
  },
  {
    id: "deudas", nivel: "intermedio", glosario: ["bola-nieve"], titulo: "Cómo salir de deudas", minutos: 4, icon: "trending-down",
    puntos: ["Método bola de nieve: pagas primero la deuda más pequeña para ganar motivación.", "Método avalancha: pagas primero la de tasa más alta para pagar menos intereses.", "En los dos, pagas el mínimo en todas y lo que sobre va a la deuda elegida. Evita tomar deuda nueva mientras tanto."],
    pregunta: { q: "Si quieres pagar menos intereses en total, ¿qué deuda atacas primero?", opciones: ["La más pequeña", "La de tasa más alta", "La más nueva"], correcta: 1, porque: "Ese es el método avalancha: ahorras más en intereses." }, ir: { href: "/estrategia", label: "Arma tu plan para salir de deudas" },
  },
  {
    id: "tarjeta", nivel: "intermedio", glosario: ["pago-minimo", "avance", "diferir"], titulo: "La tarjeta de crédito a tu favor", minutos: 3, icon: "credit-card",
    puntos: ["Si pagas el total antes de la fecha límite, normalmente no pagas intereses por las compras de ese mes.", "Diferir a muchas cuotas parece cómodo, pero cada cuota tiene intereses: lo barato sale caro.", "Los avances en efectivo cobran intereses desde el primer día. Evítalos."],
    pregunta: { q: "¿Qué pasa si pagas solo el mínimo de la tarjeta?", opciones: ["No pasa nada", "Te cobran intereses sobre el saldo que queda", "Te bajan la tasa"], correcta: 1, porque: "El saldo que no pagas sigue generando intereses mes a mes." }, ir: { href: "/tarjetas", label: "Revisa tus tarjetas" },
  },
  {
    id: "invertir", nivel: "avanzado", glosario: ["cdt", "fic", "rentabilidad-riesgo"], titulo: "Primeros pasos para invertir", minutos: 4, icon: "trending-up",
    puntos: ["Invierte solo cuando ya tengas fondo de emergencia y tus deudas caras estén controladas.", "Opciones sencillas en Colombia: CDT, cuentas de alto rendimiento y fondos de inversión colectiva.", "Más rentabilidad casi siempre significa más riesgo. Desconfía de quien te prometa ganancias altas y seguras."],
    pregunta: { q: "Te ofrecen una inversión que \"duplica tu plata en un mes, sin riesgo\". ¿Qué haces?", opciones: ["Invierto todo", "Desconfío: puede ser una estafa", "Invierto la mitad"], correcta: 1, porque: "Rentabilidad alta sin riesgo no existe. Verifica que la entidad esté vigilada por la Superfinanciera." }, ir: { href: "/calculadoras", label: "Simula un CDT" },
  },
  {
    id: "renta", nivel: "avanzado", glosario: ["uvt", "declaracion-renta", "retencion"], titulo: "¿Debo declarar renta?", minutos: 3, icon: "file-check",
    puntos: ["Declaras si superaste alguno de los topes del año anterior: ingresos, patrimonio, compras, consumos con tarjeta o consignaciones.", "Los topes se miden en UVT, una unidad que la DIAN actualiza cada año.", "Declarar no siempre significa pagar: muchas personas declaran y les sale en cero o con saldo a favor."],
    pregunta: { q: "¿Declarar renta significa siempre pagar impuesto?", opciones: ["Sí, siempre", "No, a veces da cero o saldo a favor", "Solo si eres independiente"], correcta: 1, porque: "Depende de tus ingresos, deducciones y retenciones." }, ir: { href: "/renta", label: "Revisa tu renta" },
  },
  {
    id: "nomina", nivel: "intermedio", glosario: ["salud-pension", "fsp", "retencion", "procedimiento"], titulo: "Lo que te descuentan de la nómina", minutos: 4, icon: "receipt-text",
    puntos: ["Si eres empleado, de tu salario te descuentan 4 % para salud y 4 % para pensión. Tu empresa paga otra parte por su cuenta.", "Si ganas 4 salarios mínimos o más, también aportas al fondo de solidaridad pensional (desde 1 %).", "Si tu salario es alto, la empresa te retiene una parte para la DIAN: es un anticipo de tu impuesto de renta, no una pérdida.", "Registra tu salario en Mirai con el valor antes de descuentos y te mostramos lo que de verdad te llega."],
    pregunta: { q: "¿Qué porcentaje de tu salario te descuentan para salud si eres empleado?", opciones: ["4 %", "8 %", "12,5 %"], correcta: 0, porque: "El empleado aporta 4 % para salud y 4 % para pensión; el resto lo pone la empresa." }, ir: { href: "/ingresos", label: "Registra tu salario" },
  },
  {
    id: "primas", nivel: "intermedio", glosario: ["prima", "cesantias", "intereses-cesantias"], titulo: "Prima y cesantías: plata que ya sabes que llega", minutos: 3, icon: "gift",
    puntos: ["La prima es un mes de salario al año en dos pagos: a más tardar el 30 de junio y en los primeros 20 días de diciembre.", "Las cesantías (un mes de salario por año) van a tu fondo a más tardar el 14 de febrero; los intereses sobre cesantías (12 % al año) te los paga la empresa en enero.", "Como sabes que llegan, decide antes en qué las vas a usar: una deuda cara, tu fondo de emergencia o una meta."],
    pregunta: { q: "¿Dónde quedan tus cesantías cada año?", opciones: ["En tu cuenta de nómina", "En tu fondo de cesantías", "Las guarda la empresa"], correcta: 1, porque: "La empresa las consigna en el fondo de cesantías que elegiste." }, ir: { href: "/primas", label: "Planea tu prima" },
  },
  {
    id: "credito-historial", nivel: "intermedio", glosario: ["centrales-riesgo", "usura", "gota-a-gota"], titulo: "Cuida tu historial de crédito", minutos: 3, icon: "shield-check",
    puntos: ["Los bancos reportan a las centrales de riesgo cómo pagas. Pagar a tiempo construye un buen historial.", "Antes de reportarte por mora te deben avisar con al menos 20 días. Si pagas, el reporte negativo dura el doble del tiempo que estuviste en mora, máximo cuatro años.", "Evita los préstamos gota a gota: cobran más que la usura y son ilegales. Busca entidades vigiladas."],
    pregunta: { q: "¿Qué ayuda más a tener un buen historial de crédito?", opciones: ["Pedir muchos créditos", "Pagar a tiempo", "No tener ninguna cuenta"], correcta: 1, porque: "Pagar puntual es lo que más pesa en tu historial." }, ir: { href: "/recordatorios", label: "Revisa tus próximos pagos" },
  },
]

/** Porcentaje de lecciones completadas. */
export const avance = (hechas: string[]) => Math.round((LECCIONES.filter((l) => hechas.includes(l.id)).length / LECCIONES.length) * 100)

export const nivelDe = (l: Leccion): Nivel => l.nivel ?? "basico"

/** Avance por nivel: lecciones hechas y total. */
export function avancePorNivel(hechas: string[]) {
  return (Object.keys(NIVELES) as Nivel[]).map((n) => {
    const ls = LECCIONES.filter((l) => nivelDe(l) === n)
    return { nivel: n, total: ls.length, hechas: ls.filter((l) => hechas.includes(l.id)).length, minutos: ls.reduce((a, l) => a + l.minutos, 0) }
  })
}

/** Siguiente lección sugerida: la primera sin terminar, en orden de nivel. */
export function siguienteLeccion(hechas: string[]) {
  const orden: Nivel[] = ["basico", "intermedio", "avanzado"]
  return [...LECCIONES].sort((a, b) => orden.indexOf(nivelDe(a)) - orden.indexOf(nivelDe(b))).find((l) => !hechas.includes(l.id)) ?? null
}

export type Insignia = { id: string; label: string; desc: string; icon: string; ok: boolean }

/** Insignias de la Academia según las lecciones terminadas. */
export function insignias(hechas: string[]): Insignia[] {
  const n = LECCIONES.filter((l) => hechas.includes(l.id)).length
  const nivel = (k: Nivel) => LECCIONES.filter((l) => nivelDe(l) === k).every((l) => hechas.includes(l.id))
  return [
    { id: "primer-paso", label: "Primer paso", desc: "Terminaste tu primera lección", icon: "sprout", ok: n >= 1 },
    { id: "basico", label: "Bases firmes", desc: "Completaste el nivel básico", icon: "piggy-bank", ok: nivel("basico") },
    { id: "intermedio", label: "Sin miedo al crédito", desc: "Completaste el nivel intermedio", icon: "credit-card", ok: nivel("intermedio") },
    { id: "avanzado", label: "Mente inversionista", desc: "Completaste el nivel avanzado", icon: "trending-up", ok: nivel("avanzado") },
    { id: "graduado", label: "Graduado Mirai", desc: "Terminaste toda la Academia", icon: "graduation-cap", ok: n === LECCIONES.length },
  ]
}
