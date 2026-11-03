// De la frase a la tarjeta, sin IA: cruza las interpretaciones de detectActions (lib/chat/intent.ts) con el libro
// (lib/chat/acciones.ts) y devuelve la propuesta para confirmar, una pregunta (falta un dato o hay varias opciones) o
// null (no era un registro: sigue la respuesta con datos o la IA). Puro: la categoría llega con `categorize`.
import { addDays, iso, toDay, type BookData } from "@mirai/domain"
import type { AccessRole } from "@mirai/domain/household/roles"
import {
  armarAbonoMeta, armarCobroSub, armarCompraTarjeta, armarPagoCuota, armarPagoFijo, armarPagoTarjeta, armarPrestamo, findCard, findFixed, findGoal, findLoan, findSub,
  fijoDelGasto, medioEnTexto, type Armado,
} from "./acciones"
import type { Accion } from "./intent"
import { puedeProponer, sinPermiso } from "./permisos"
import type { Categorize } from "./tools"
import type { Propuesta, PropuestaTipo } from "./types"

export type Resuelto = { propuesta: Propuesta; texto: string } | { msg: string }

const $ = (v: number) => `$ ${Math.round(v).toLocaleString("es-CO")}`

export async function resolverAcciones(acts: Accion[], o: { b: BookData; today: string; access: AccessRole; categorize: Categorize; texto?: string }): Promise<Resuelto | null> {
  const { b, today } = o
  const md = o.texto ? medioEnTexto(o.texto, (b as { paymentMethods?: { id: string; nombre: string }[] }).paymentMethods) : undefined
  const medio = md ? { payment_method_id: md.id, medio: md.nombre } : {}
  if (!acts.length) return null
  // Con varias interpretaciones ("pagué el arriendo": ¿fijo, suscripción o deuda?) solo vale la que encuentra el registro.
  const varias = acts.length > 1
  let pregunta: string | null = null
  for (const a of acts) {
    const fecha = a.cuando === "ayer" ? iso(addDays(toDay(today), -1)) : today
    let tipo: PropuestaTipo = a.tipo
    let r: Armado | null = null
    switch (a.tipo) {
      case "gasto": {
        // "Pagué 180 mil de la luz" con el fijo "Energía" pendiente: es el pago del fijo (no un gasto aparte).
        const f = puedeProponer(o.access, "pago_fijo") ? fijoDelGasto(b, today, a.descripcion) : undefined
        if (f) { tipo = "pago_fijo"; r = armarPagoFijo(b, today, { ref: f.nombre, valor: a.valor, fecha }, f); break }
        if (!puedeProponer(o.access, "gasto")) return { msg: sinPermiso(o.access, "gasto") }
        const cat = await o.categorize(a.descripcion, a.valor)
        r = { ok: true, datos: { valor: a.valor, descripcion: a.descripcion, fecha, category_id: cat.id, categoria: cat.nombre, cat_src: cat.src, ...medio }, resumen: `el gasto de **${$(a.valor)}** (${a.descripcion})` }
        break
      }
      case "ingreso":
        r = { ok: true, datos: { valor: a.valor, descripcion: a.descripcion, fecha, ...medio }, resumen: `el ingreso de **${$(a.valor)}** (${a.descripcion})` }
        break
      case "prestamo":
        r = armarPrestamo(b, today, { kind: a.kind, valor: a.valor, persona: a.persona, plazo: a.plazo, frec: a.frec, tasa: a.tasa, fecha })
        break
      case "pago_cuota":
        if ((a.estricto || varias) && !findLoan(b, a.ref, a.kind, today).item) continue
        r = armarPagoCuota(b, today, { kind: a.kind, ref: a.ref, cuotas: a.cuotas, valor: a.valor, fecha })
        break
      case "pago_fijo":
        if (varias && !findFixed(b, a.ref).item) continue
        r = armarPagoFijo(b, today, { ref: a.ref, valor: a.valor, fecha })
        break
      case "cobro_suscripcion":
        if (varias && !findSub(b, a.ref).item) continue
        r = armarCobroSub(b, today, { ref: a.ref })
        break
      case "abono_meta":
        if (!a.explicito && !findGoal(b, a.ref).item) continue
        r = armarAbonoMeta(b, today, { ref: a.ref, valor: a.valor, fecha })
        break
      case "pago_tarjeta":
        if (varias && !findCard(b, a.ref).item) continue
        r = armarPagoTarjeta(b, today, { ref: a.ref, valor: a.valor, total: a.total, fecha })
        break
      case "compra_tarjeta": {
        r = armarCompraTarjeta(b, today, { ref: a.ref, valor: a.valor, descripcion: a.descripcion, cuotas: a.cuotas, fecha })
        if (r.ok) { const cat = await o.categorize(a.descripcion, a.valor); r.datos = { ...r.datos, category_id: cat.id, categoria: cat.nombre, cat_src: cat.src } }
        break
      }
    }
    if (!r) continue
    if (!puedeProponer(o.access, tipo)) return { msg: sinPermiso(o.access, tipo) }
    if (r.ok) {
      const propuesta: Propuesta = { id: crypto.randomUUID(), tipo, estado: "pendiente", datos: r.datos }
      return { propuesta, texto: `Listo, preparé ${r.resumen}. Revisa los datos y toca **Confirmar** para guardarlo.` }
    }
    pregunta ??= r.msg
  }
  return pregunta ? { msg: pregunta } : null
}
