// Calendario fiscal y laboral de Colombia (FPL, FCAT, fcatOf, calEst de la v4).
import type { BookData } from "@/lib/domain"
import { fijoMensual, nextOcc as nextOccDomain, salarioDesdeIngresos } from "@/lib/domain"

export type FCatKey = "laboral" | "dian" | "local" | "vehiculo" | "hogar" | "personal"
export const FCAT: Record<FCatKey, { n: string; color: string; icon: string }> = {
  laboral: { n: "Laboral", color: "#16A34A", icon: "briefcase" },
  dian: { n: "Impuestos DIAN", color: "#E5484D", icon: "landmark" },
  local: { n: "Impuestos locales", color: "#F97316", icon: "building-2" },
  vehiculo: { n: "Vehículo", color: "#2F6FED", icon: "car" },
  hogar: { n: "Hogar y familia", color: "#8E4EC6", icon: "house" },
  personal: { n: "Personal", color: "#0891B2", icon: "user" },
}

export function fcatOf(c: { cat?: string | null; titulo: string }): FCatKey {
  if (c.cat && c.cat in FCAT) return c.cat as FCatKey
  const t = c.titulo.toLowerCase()
  if (/cesant|prima|dotaci|salario/.test(t)) return "laboral"
  if (/renta|dian|exterior/.test(t)) return "dian"
  if (/predial|vehicular|ica/.test(t)) return "local"
  if (/soat|tecnico|técnico|mecanica|mecánica/.test(t)) return "vehiculo"
  if (/matr|arriendo|colegio/.test(t)) return "hogar"
  return "personal"
}

export type Plantilla = { k: string; cat: FCatKey; titulo: string; fecha: string; tipo: "ingreso" | "egreso"; nota: string; fuente?: string }

/** Plantillas de fechas importantes de Colombia para el año `y` (verificadas para 2026). */
export function FPL(y: number, today: string): Plantilla[] {
  const D = (m: number, d: number) => `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`
  const mesActual = today.slice(0, 7) + "-01"
  return [
    { k: "int_ces", cat: "laboral", titulo: "Intereses sobre cesantías", fecha: D(1, 31), tipo: "ingreso", nota: "Los paga el empleador a más tardar el 31 de enero (12 % anual sobre las cesantías)." },
    { k: "ces", cat: "laboral", titulo: "Consignación de cesantías al fondo", fecha: D(2, 14), tipo: "ingreso", nota: "Plazo para consignar las del año anterior en tu fondo (Porvenir, Protección, Colfondos, FNA…)." },
    { k: "prima1", cat: "laboral", titulo: "Prima de servicios (1er semestre)", fecha: D(6, 30), tipo: "ingreso", nota: "Medio salario por semestre trabajado. Plazo legal: 30 de junio." },
    { k: "prima2", cat: "laboral", titulo: "Prima de servicios (2º semestre)", fecha: D(12, 20), tipo: "ingreso", nota: "Medio salario. Plazo legal: 20 de diciembre." },
    { k: "dot1", cat: "laboral", titulo: "Dotación de vestido y calzado (1ª entrega)", fecha: D(4, 30), tipo: "ingreso", nota: "Si ganas hasta 2 salarios mínimos. Entregas: 30 abr, 31 ago y 20 dic." },
    { k: "dot2", cat: "laboral", titulo: "Dotación (2ª entrega)", fecha: D(8, 31), tipo: "ingreso", nota: "Si ganas hasta 2 salarios mínimos." },
    { k: "dot3", cat: "laboral", titulo: "Dotación (3ª entrega)", fecha: D(12, 20), tipo: "ingreso", nota: "Si ganas hasta 2 salarios mínimos." },
    { k: "smmlv", cat: "laboral", titulo: "Nuevo salario mínimo", fecha: D(1, 1), tipo: "ingreso", nota: "Rige el aumento del salario mínimo y del auxilio de transporte." },
    { k: "renta", cat: "dian", titulo: "Declaración de renta (DIAN)", fecha: D(8, 12), tipo: "egreso", nota: "Depende de los 2 últimos dígitos de tu cédula (calendario DIAN).", fuente: "https://www.dian.gov.co" },
    { k: "activos", cat: "dian", titulo: "Declaración de activos en el exterior", fecha: D(8, 12), tipo: "egreso", nota: "Si tenías activos en el exterior por más de 2.000 UVT al 1 de enero. Mismo plazo que la renta." },
    { k: "pred_bog", cat: "local", titulo: "Predial Bogotá con 10 % de descuento", fecha: D(4, 17), tipo: "egreso", nota: "2026: con descuento hasta el 17 de abril; sin descuento hasta el 10 de julio.", fuente: "https://www.haciendabogota.gov.co" },
    { k: "pred_bog2", cat: "local", titulo: "Predial Bogotá (último plazo)", fecha: D(7, 10), tipo: "egreso", nota: "Último plazo sin descuento en 2026.", fuente: "https://www.haciendabogota.gov.co" },
    { k: "veh_bog", cat: "local", titulo: "Impuesto vehicular Bogotá con 10 % de descuento", fecha: D(5, 15), tipo: "egreso", nota: "2026: con descuento hasta el 15 de mayo; sin descuento hasta el 24 de julio.", fuente: "https://www.haciendabogota.gov.co" },
    { k: "veh_bog2", cat: "local", titulo: "Impuesto vehicular Bogotá (último plazo)", fecha: D(7, 24), tipo: "egreso", nota: "Último plazo sin descuento en 2026.", fuente: "https://www.haciendabogota.gov.co" },
    { k: "soat", cat: "vehiculo", titulo: "Renovar SOAT", fecha: today, tipo: "egreso", nota: "Vence un año después de comprado. Cambia la fecha por la de tu póliza." },
    { k: "rtm", cat: "vehiculo", titulo: "Revisión técnico-mecánica", fecha: today, tipo: "egreso", nota: "Carros desde el 5º año de matrícula; motos desde el 2º." },
    { k: "matri", cat: "hogar", titulo: "Matrículas y útiles escolares", fecha: D(1, 15), tipo: "egreso", nota: "Calendario A: enero; calendario B: julio." },
    { k: "arriendo", cat: "hogar", titulo: "Ajuste anual del arriendo", fecha: mesActual, tipo: "egreso", nota: "Máximo el IPC del año anterior (5,1 % para 2026), en el aniversario del contrato." },
    { k: "navidad", cat: "personal", titulo: "Presupuesto de diciembre (regalos y fiestas)", fecha: D(12, 1), tipo: "egreso", nota: "Separa desde antes para no endeudarte." },
    { k: "vacas", cat: "personal", titulo: "Vacaciones de mitad de año", fecha: D(6, 15), tipo: "egreso", nota: "Planea el presupuesto del viaje." },
  ]
}

/** Próxima ocurrencia: una vez → su fecha; si no, mismo día este año o el siguiente si ya pasó (tolerancia 1 día). La regla vive en lib/domain/dates.ts. */
export function nextOcc(c: { fecha: string; anual: boolean | null }, today: string) {
  return nextOccDomain({ fecha: c.fecha, anual: !!c.anual }, today, 1)
}

export type TaxAsset = { tipo: string; avaluo: number; predial: number | null; imp_veh: number | null; soat: number | null; pct: number }

/**
 * Estimado de una fecha (calEst de la v4, sin la renta que viene de la Declaración).
 * Devuelve { v, how } o null si no hay cómo estimarla.
 */
export function calEst(c: { titulo: string; template_key?: string | null }, b: BookData, assets: TaxAsset[], smmlv: number, incomeCategories: { id: string; nombre: string }[]) {
  const k = c.template_key ?? ""
  const t = c.titulo.toLowerCase()
  const sal = salarioDesdeIngresos(b.incomes, incomeCategories, b.settings.trm)
  const desc = /descuento/.test(t)
  if (/prima/.test(t) && sal) return { v: sal / 2, how: "Medio salario mensual." }
  if (/intereses.*cesant/.test(t) && sal) return { v: sal * 0.12, how: "12 % de las cesantías (un salario)." }
  if (/cesant/.test(t) && sal) return { v: sal, how: "Un salario mensual por año trabajado." }
  if (/dotaci/.test(t)) return sal && sal <= 2 * smmlv ? { v: 0, how: "Te la entregan en especie (ropa y calzado), no en dinero." } : { v: 0, how: "Solo aplica si ganas hasta 2 salarios mínimos." }
  if (/predial/.test(t)) {
    const inm = assets.filter((a) => a.tipo === "inmueble")
    if (!inm.length) return null
    const v = inm.reduce((a, x) => a + (x.predial ?? x.avaluo * 0.007) * (x.pct / 100), 0)
    return { v: desc ? v * 0.9 : v, how: `Predial registrado o 7 por mil del avalúo${desc ? ", con 10 % de descuento" : ""}.` }
  }
  if (/vehicular/.test(t)) {
    const veh = assets.filter((a) => a.tipo === "vehiculo")
    if (!veh.length) return null
    const v = veh.reduce((a, x) => a + (x.imp_veh ?? x.avaluo * (x.avaluo <= 60e6 ? 0.015 : x.avaluo <= 135e6 ? 0.025 : 0.035)) * (x.pct / 100), 0)
    return { v: desc ? v * 0.9 : v, how: `Impuesto registrado o tarifa de 1,5 %, 2,5 % o 3,5 % del avalúo${desc ? ", con 10 % de descuento" : ""} (aproximación Bogotá).` }
  }
  if (/soat/.test(t)) { const v = assets.filter((a) => a.tipo === "vehiculo").reduce((a, x) => a + (x.soat ?? 0), 0); return v ? { v, how: "Valor de tu póliza registrada." } : null }
  if (/matr/.test(t)) { const f = b.fixedExpenses.find((x) => /coleg|jard|univers|pensi/i.test(x.nombre)); return f ? { v: fijoMensual(f), how: `Una mensualidad de “${f.nombre}”.` } : null }
  if (/arriendo/.test(t)) { const f = b.fixedExpenses.find((x) => /arriendo/i.test(x.nombre)); return f ? { v: f.valor * 0.051, how: "5,1 % (IPC 2025) del canon actual: es lo máximo que puede subir." } : null }
  if (/diciembre/.test(t) && sal) return { v: (sal / 2) * 0.3, how: "30 % de la prima de diciembre." }
  if (k === "renta") return null
  return null
}
