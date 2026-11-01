// Academia Mirai: lecciones cortas de finanzas personales en palabras simples, con una pregunta de repaso.

export type Leccion = { id: string; titulo: string; minutos: number; icon: string; puntos: string[]; pregunta: { q: string; opciones: string[]; correcta: number; porque: string }; ir?: { href: string; label: string } }

export const LECCIONES: Leccion[] = [
  {
    id: "presupuesto", titulo: "El presupuesto 50/30/20", minutos: 3, icon: "chart-pie",
    puntos: ["Divide lo que te entra en tres partes: 50 % para lo necesario (arriendo, comida, servicios), 30 % para gustos y 20 % para ahorrar o pagar deudas.", "No es una regla rígida: es un punto de partida. Si tu arriendo se lleva más, recorta en gustos, no en ahorro.", "Lo importante es decidir a dónde va la plata antes de gastarla, no al final del mes."],
    pregunta: { q: "Si te ganas $2.000.000, ¿cuánto deberías apartar para ahorrar o pagar deudas según la regla?", opciones: ["$200.000", "$400.000", "$1.000.000"], correcta: 1, porque: "El 20 % de $2.000.000 es $400.000." }, ir: { href: "/presupuesto", label: "Arma tu presupuesto" },
  },
  {
    id: "emergencia", titulo: "Tu fondo de emergencia", minutos: 3, icon: "shield-check",
    puntos: ["Es plata guardada solo para imprevistos: una enfermedad, quedarte sin trabajo o un daño en la casa.", "La meta es tener entre 3 y 6 meses de tus gastos necesarios. Empieza con una meta pequeña, como un mes.", "Guárdalo en una cuenta aparte que rinda algo y que puedas sacar rápido, no en efectivo en la casa."],
    pregunta: { q: "¿Para qué NO debería usarse el fondo de emergencia?", opciones: ["Una cirugía inesperada", "Las vacaciones de fin de año", "Quedarse sin trabajo"], correcta: 1, porque: "Las vacaciones se planean: para eso es una meta de ahorro, no la emergencia." }, ir: { href: "/metas", label: "Crea tu fondo" },
  },
  {
    id: "hormiga", titulo: "Los gastos hormiga", minutos: 2, icon: "coffee",
    puntos: ["Son gastos pequeños y frecuentes: el tinto, el domicilio, el paquete del semáforo. Uno solo no pesa; juntos sí.", "Un gasto de $8.000 al día son unos $240.000 al mes y casi $3.000.000 al año.", "No se trata de quitártelos todos, sino de elegir cuáles de verdad disfrutas."],
    pregunta: { q: "Un gasto hormiga de $10.000 diarios, ¿cuánto suma más o menos en un año?", opciones: ["$365.000", "$1.200.000", "$3.650.000"], correcta: 2, porque: "$10.000 × 365 días = $3.650.000." }, ir: { href: "/gastos", label: "Revisa tus gastos hormiga" },
  },
  {
    id: "tasas", titulo: "Tasas de interés sin enredos", minutos: 4, icon: "percent",
    puntos: ["La tasa efectiva anual (E.A.) es la que te dice cuánto pagas o ganas en un año completo. Úsala para comparar.", "La tasa de usura es el máximo que la ley permite cobrar en Colombia; la publica la Superfinanciera cada mes.", "En un crédito, mira el costo total: la cuota por el número de meses, más seguros y cuotas de manejo."],
    pregunta: { q: "¿Qué tasa sirve para comparar dos créditos?", opciones: ["La tasa mensual vencida", "La tasa efectiva anual (E.A.)", "La que tenga la cuota más baja"], correcta: 1, porque: "La E.A. incluye el efecto de los intereses sobre intereses en un año." }, ir: { href: "/calculadoras", label: "Calcula un crédito" },
  },
  {
    id: "deudas", titulo: "Cómo salir de deudas", minutos: 4, icon: "trending-down",
    puntos: ["Método bola de nieve: pagas primero la deuda más pequeña para ganar motivación.", "Método avalancha: pagas primero la de tasa más alta para pagar menos intereses.", "En los dos, pagas el mínimo en todas y lo que sobre va a la deuda elegida. Evita tomar deuda nueva mientras tanto."],
    pregunta: { q: "Si quieres pagar menos intereses en total, ¿qué deuda atacas primero?", opciones: ["La más pequeña", "La de tasa más alta", "La más nueva"], correcta: 1, porque: "Ese es el método avalancha: ahorras más en intereses." }, ir: { href: "/estrategia", label: "Arma tu plan para salir de deudas" },
  },
  {
    id: "tarjeta", titulo: "La tarjeta de crédito a tu favor", minutos: 3, icon: "credit-card",
    puntos: ["Si pagas el total antes de la fecha límite, normalmente no pagas intereses por las compras de ese mes.", "Diferir a muchas cuotas parece cómodo, pero cada cuota tiene intereses: lo barato sale caro.", "Los avances en efectivo cobran intereses desde el primer día. Evítalos."],
    pregunta: { q: "¿Qué pasa si pagas solo el mínimo de la tarjeta?", opciones: ["No pasa nada", "Te cobran intereses sobre el saldo que queda", "Te bajan la tasa"], correcta: 1, porque: "El saldo que no pagas sigue generando intereses mes a mes." }, ir: { href: "/tarjetas", label: "Revisa tus tarjetas" },
  },
  {
    id: "invertir", titulo: "Primeros pasos para invertir", minutos: 4, icon: "trending-up",
    puntos: ["Invierte solo cuando ya tengas fondo de emergencia y tus deudas caras estén controladas.", "Opciones sencillas en Colombia: CDT, cuentas de alto rendimiento y fondos de inversión colectiva.", "Más rentabilidad casi siempre significa más riesgo. Desconfía de quien te prometa ganancias altas y seguras."],
    pregunta: { q: "Te ofrecen una inversión que \"duplica tu plata en un mes, sin riesgo\". ¿Qué haces?", opciones: ["Invierto todo", "Desconfío: puede ser una estafa", "Invierto la mitad"], correcta: 1, porque: "Rentabilidad alta sin riesgo no existe. Verifica que la entidad esté vigilada por la Superfinanciera." }, ir: { href: "/calculadoras", label: "Simula un CDT" },
  },
  {
    id: "renta", titulo: "¿Debo declarar renta?", minutos: 3, icon: "file-check",
    puntos: ["Declaras si superaste alguno de los topes del año anterior: ingresos, patrimonio, compras, consumos con tarjeta o consignaciones.", "Los topes se miden en UVT, una unidad que la DIAN actualiza cada año.", "Declarar no siempre significa pagar: muchas personas declaran y les sale en cero o con saldo a favor."],
    pregunta: { q: "¿Declarar renta significa siempre pagar impuesto?", opciones: ["Sí, siempre", "No, a veces da cero o saldo a favor", "Solo si eres independiente"], correcta: 1, porque: "Depende de tus ingresos, deducciones y retenciones." }, ir: { href: "/renta", label: "Revisa tu renta" },
  },
]

/** Porcentaje de lecciones completadas. */
export const avance = (hechas: string[]) => Math.round((LECCIONES.filter((l) => hechas.includes(l.id)).length / LECCIONES.length) * 100)
