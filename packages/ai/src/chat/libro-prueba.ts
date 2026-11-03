// Libro de ejemplo para las pruebas del chat (Vitest): parecido al ejemplo de la familia Navarro. No lo usa la app.
import type { LoadedBook } from "@mirai/domain/book-data"

export const HOY = "2026-11-02"

export function libroPrueba(): LoadedBook {
  const cat = (id: string, nombre: string, grupo: string, tope = 0) => ({ id, nombre, grupo, icon: "tag", tope })
  const b = {
    raw: { settings: {} },
    settings: { umbral: 25000, limite: 0, trm: { USD: 4000 }, pct: { n: 50, g: 30, a: 20 }, emerg_meta: 3, anticipo: 5, corte_q: 15, alerta_pres: 80, notif: {}, uvt: {}, smmlv: {}, nomina: {} },
    categories: [cat("c-mer", "Mercado", "n", 900000), cat("c-res", "Restaurantes", "g", 300000), cat("c-viv", "Vivienda", "n"), cat("c-ser", "Servicios públicos", "n"), cat("c-sus", "Suscripciones", "g"), cat("c-tec", "Tecnología", "g"), cat("c-otr", "Otros", "g")],
    incomes: [{ id: "i1", concepto: "Salario", valor: 2500000, frec: "quincenal", dia: 15, currency: "COP" }],
    extraIncomes: [{ id: "x1", fecha: "2026-11-01", descripcion: "Venta de bicicleta", valor: 400000 }],
    expenses: [
      { id: "e1", fecha: "2026-11-01", descripcion: "Éxito", valor: 250000, category_id: "c-mer" },
      { id: "e2", fecha: "2026-11-02", descripcion: "Almuerzo", valor: 25000, category_id: "c-res" },
      { id: "e3", fecha: "2026-10-10", descripcion: "Éxito", valor: 300000, category_id: "c-mer" },
    ],
    fixedExpenses: [
      { id: "f-arr", nombre: "Arriendo", valor: 1700000, frec: "mensual", dia: 5, desde: "2026-09", category_id: "c-viv", payments: [{ periodo: "2026-09", fecha: "2026-09-05", valor: 1700000 }, { periodo: "2026-10", fecha: "2026-10-05", valor: 1700000 }] },
      { id: "f-luz", nombre: "Energía", valor: 186000, frec: "mensual", dia: 6, desde: "2026-10", variable: true, category_id: "c-ser", payments: [{ periodo: "2026-10", fecha: "2026-10-06", valor: 180000 }] },
    ],
    subscriptions: [{ id: "s-net", nombre: "Netflix", valor: 44900, ciclo: "mensual", proximo: "2026-11-06", currency: "COP", comparte: 1 }],
    loans: [
      { id: "l-carro", kind: "pagar", tipo: "banco", entity_id: "en-bc", contact_id: null, concepto: "Crédito de vehículo", monto: 30000000, sistema: "frances", tasa: 1.23, frec: "mensual", plazo: 48, inicio: "2025-08-31", extra: 0, payments: [] },
      { id: "l-andres", kind: "cobrar", tipo: "presto", entity_id: null, contact_id: "ct-andres", concepto: "Préstamo para el carro", monto: 4000000, sistema: "frances", tasa: 1, frec: "mensual", plazo: 8, inicio: "2026-07-31", extra: 0, payments: [{ fecha: "2026-08-31", tipo: "cuota", valor: 0 }] },
    ],
    creditCards: [{ id: "t-visa", nombre: "Visa Oro", corte: 20, pago: 5, tasa: 2, cupo: 5000000, purchases: [{ id: "p1", fecha: "2026-10-01", valor: 600000, cuotas: 3 }] }],
    assets: [{ id: "a1", cod: "1105", nombre: "Nequi", valor: 1200000, currency: "COP" }],
    liabilities: [],
    investments: [],
    goals: [{ id: "g-viaje", nombre: "Viaje a Cartagena", objetivo: 8000000, ahorrado: 2600000, fecha: "2027-06-30" }, { id: "g-casa", nombre: "Cuota inicial de vivienda", objetivo: 60000000, ahorrado: 14500000, fecha: "2029-04-30" }],
    calendarEvents: [],
    contacts: [{ id: "ct-andres", nombre: "Andrés Navarro" }, { id: "ct-laura", nombre: "Laura Gómez" }],
    entities: [{ id: "en-bc", nombre: "Bancolombia" }],
  }
  return b as unknown as LoadedBook
}
