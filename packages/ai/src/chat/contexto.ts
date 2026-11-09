// Contexto completo del libro para la IA del chat, con los mismos cálculos del Balance y el Dashboard (flujo integral,
// compromisos, capacidad, deudas y metas). Puro: lo arma features/chat/server.ts con el libro ya cargado.
// Antes el chat solo veía ingresos fijos, gastos por categoría y deudas de Le debo; ahora también ingresos extra,
// tarjetas, otras deudas, impuestos por pagar, topes del presupuesto, cuentas y lo que te conviene hacer.
import { addDays, conv, gastosMesK, iso, mkey, toDay, type BookData } from "@mirai/domain"
import { estadoIntegral, flujoIntegral, type ExtrasIntegral } from "@mirai/domain/flujo-integral"
import { capacidad, compromisos, decisiones, deudas, metasAvance } from "@mirai/domain/dashboard"
import { metaEstado, parseMetaCfg } from "@mirai/domain/meta"
import { clip, toLines, topN } from "../compact"
import type { ChatFacts } from "../router"

const r0 = (v: number) => Math.round(+v || 0)

/** Texto "DATOS" para el primer mensaje de la IA (clave: valor por línea, cifras exactas como en pantalla). */
export function contextoChat(b: BookData, today: string, f: ChatFacts, X: ExtrasIntegral = {}): string {
  const t = toDay(today)
  const k = mkey(t)
  const trm = b.settings.trm
  const I = f.integral
  const E = estadoIntegral(b, today, X)
  const C = compromisos(b, today)
  const cap = capacidad(b, today, C, E.liquidez)
  const D = deudas(b, today)
  const R = flujoIntegral(b, { a: iso(addDays(t, -90)), b: iso(addDays(t, 365)), tipo: "rango" }, today, X)
  const en30 = iso(addDays(t, 30))
  const vencidos = R.movs.filter((x) => x.estado === "vencido")
  const proximos = R.movs.filter((x) => x.fecha >= today && x.fecha <= en30 && x.estado !== "hecho" && x.modulo !== "presupuesto")
  // La meta financiera principal del libro (Perfil): el norte con el que la IA ordena sus consejos.
  const M = metaEstado(parseMetaCfg((b.settings as { meta_cfg?: unknown }).meta_cfg), String((b.settings as { meta?: string }).meta ?? ""), b, today)
  const dec = decisiones(b, today, { comp: C, cap, deu: D, vencidos, proximos: R.movs, meta: M })
  const extrasMes = b.extraIncomes.filter((x) => x.fecha.startsWith(k)).reduce((a, x) => a + conv(+x.valor, (x as { currency?: string }).currency, trm), 0)
  const gastoCat = new Map<string, number>()
  for (const g of gastosMesK(b.expenses, k)) gastoCat.set(g.category_id ?? "", (gastoCat.get(g.category_id ?? "") ?? 0) + +g.valor)
  const topes = b.categories.filter((c) => +c.tope > 0).map((c) => ({ c, g: gastoCat.get(c.id) ?? 0 }))
    .map(({ c, g }) => ({ categoria: clip(c.nombre, 24), tope: r0(+c.tope), gastado: r0(g), pct: Math.round((g / +c.tope) * 100) }))
    .sort((a, b) => b.pct - a.pct).slice(0, 6)
  const cuentas = (b.assets as (BookData["assets"][number] & { nombre?: string })[]).filter((a) => /^11/.test(String(a.cod)))
    .map((a) => ({ nombre: clip(a.nombre ?? "Cuenta", 24), saldo: r0(conv(+a.valor, a.currency, trm)) })).sort((a, b) => b.saldo - a.saldo).slice(0, 5)

  return toLines({
    hoy: today, mes: k,
    // Igual a Balance › Tu mes (flujo integral del mes, con lo que falta por pagar y el presupuesto por gastar).
    mes_entra: I?.entra, mes_sale: I?.sale, mes_ahorro: I?.ahorro, mes_te_queda: I?.queda,
    ingreso_mensual: f.ingreso_mensual, ingresos_extra_mes: r0(extrasMes),
    gasto_registrado_mes: f.gasto_mes, gasto_registrado_mes_anterior: f.gasto_mes_anterior,
    gasto_por_categoria_mes: topN(f.por_categoria, 8),
    // Igual a Dashboard › Tus compromisos fijos y Capacidad de ahorro.
    compromisos_mes: { fijos: r0(C.fijos), cuotas: r0(C.cuotas), tarjetas: r0(C.tarjetas), suscripciones: r0(C.subs), total: r0(C.total), pct_del_ingreso: Math.round(C.pct * 100) },
    aportes_ahorro_mes: r0(C.aportes), puedes_ahorrar_mes: r0(cap.libre), gasto_variable_habitual: r0(cap.variable),
    disponible_hoy: f.disponible, meses_que_aguantas: Math.round(cap.meses * 10) / 10, meta_meses_fondo: cap.metaMeses, falta_fondo: r0(cap.faltaFondo),
    fondo_emergencia: f.fondo_emergencia, hormiga_mes: f.hormiga_mes,
    // Igual a Balance › Lo que tienes y lo que debes.
    tengo: I?.tengo, debo: I?.debo, patrimonio: I?.patrimonio,
    cuentas,
    deudas: D.items.slice(0, 8).map((d) => ({ nombre: clip(d.n, 40), tipo: d.tipo, saldo: r0(d.saldo), cuota: r0(d.cuota), frecuencia: d.frec, tasa_ea_pct: Math.round(d.ea * 1000) / 10, vencidas: d.vencidas, termina: d.fin })),
    otras_deudas: E.debo.filter((x) => x.grupo === "otras" || x.grupo === "impuestos").slice(0, 5).map((x) => ({ nombre: clip(x.n, 30), saldo: r0(x.v), estimado: x.estimado ? "si" : "" })),
    te_deben: E.tengo.filter((x) => x.grupo === "me-deben").slice(0, 6).map((x) => ({ nombre: clip(x.n, 30), saldo: r0(x.v) })),
    metas: metasAvance(b, today).slice(0, 6).map((m) => ({ nombre: clip(m.nombre, 30), objetivo: r0(m.objetivo), ahorrado: r0(m.ahorrado), falta: r0(m.falta), ahorro_mensual_para_llegar: r0(m.mensual), fecha: m.fecha })),
    meta_principal: M ? { que_quiere: clip(M.titulo, 60), tipo: M.def.tipo, objetivo: r0(M.objetivo), lleva: r0(M.llevas), falta: r0(M.falta), avance_pct: Math.round(M.progreso * 100), separar_al_mes: M.mensual ? r0(M.mensual) : "", para_cuando: M.meses ? `en ${M.meses} meses` : "", lo_que_sigue: M.siguiente ? clip(M.siguiente.t, 60) : "" } : "",
    topes_presupuesto_mes: topes,
    pagos_atrasados: vencidos.filter((x) => x.dir === "sale").slice(0, 5).map((x) => ({ que: clip(x.n, 30), valor: r0(x.v), fecha: x.fecha })),
    proximos_30_dias: proximos.slice(0, 8).map((x) => ({ que: clip(x.n, 30), valor: r0(x.v), fecha: x.fecha, dir: x.dir })),
    lo_que_te_conviene: dec.slice(0, 3).map((d) => clip(d.titulo, 80)),
    categorias: b.categories.map((c) => c.nombre).join(", "),
    tarjetas: b.creditCards.map((c) => c.nombre).join(", "),
    gastos_fijos: b.fixedExpenses.slice(0, 15).map((x) => x.nombre).join(", "),
    suscripciones: b.subscriptions.slice(0, 15).map((x) => x.nombre).join(", "),
  }, { exact: true })
}
