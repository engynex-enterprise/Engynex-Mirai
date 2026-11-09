// Libro de prueba para F2-D: categorías, reglas, medios, un gasto de cada persona, un fijo, una tarjeta, una meta,
// una cuenta y el fondo de emergencia, en B_GRATIS (5 roles, plan Gratis) y algo en B_PREMIUM (dueño, Premium).
import { B_GRATIS, B_PREMIUM, USERS } from "../setup/fixtures"
import type { FakeBookStore } from "./fakes"
import { uid } from "./fakes"

export const ID = {
  mercado: uid(1), imprevistos: uid(2), otros: uid(3), restaurantes: uid(4), arriendoCat: uid(5),
  regla: uid(10), nequi: uid(11), efectivo: uid(12),
  gastoOwner: uid(20), gastoRegistra: uid(21), gastoBorrado: uid(22),
  arriendo: uid(30), pagoArriendo: uid(31), fijoUsd: uid(32),
  tarjeta: uid(40), meta: uid(50), cuenta: uid(60), sub: uid(70), loan: uid(80),
  catPremium: uid(100), ajena: uid(101),
}

export function seedBook(s: FakeBookStore, today: string) {
  const b = B_GRATIS
  const day = Math.min(Number(today.slice(8, 10)), 28)
  s.seed("book_settings", [{ book_id: b, umbral: 25000, ia: { on: true }, defaults: { medio: ID.nequi }, smmlv: {}, uvt: {}, nomina: {} }, { book_id: B_PREMIUM, umbral: 25000, ia: { on: true }, defaults: {}, smmlv: {}, uvt: {}, nomina: {} }])
  s.seed("categories", [
    { id: ID.mercado, book_id: b, nombre: "Mercado", grupo: "n", sort: 1, tope: 0, created_by: USERS.owner },
    { id: ID.imprevistos, book_id: b, nombre: "Imprevistos", grupo: "n", sort: 2, tope: 0, created_by: USERS.owner },
    { id: ID.otros, book_id: b, nombre: "Otros", grupo: "g", sort: 3, tope: 0, created_by: USERS.owner },
    { id: ID.restaurantes, book_id: b, nombre: "Restaurantes", grupo: "g", sort: 4, tope: 0, created_by: USERS.owner },
    { id: ID.arriendoCat, book_id: b, nombre: "Vivienda", grupo: "n", sort: 5, tope: 0, created_by: USERS.owner },
    { id: ID.catPremium, book_id: B_PREMIUM, nombre: "Mercado", grupo: "n", sort: 1, tope: 0, created_by: USERS.owner },
  ])
  s.seed("keyword_rules", [{ id: ID.regla, book_id: b, keyword: "exito", category_id: ID.mercado }])
  s.seed("payment_methods", [{ id: ID.efectivo, book_id: b, nombre: "Efectivo", sort: 1 }, { id: ID.nequi, book_id: b, nombre: "Nequi", sort: 2 }])
  s.seed("expenses", [
    { id: ID.gastoOwner, book_id: b, descripcion: "Almuerzo", valor: 18000, fecha: today, category_id: ID.restaurantes, created_by: USERS.owner, external_id: "csv:ya:0" },
    { id: ID.gastoRegistra, book_id: b, descripcion: "Bus", valor: 3000, fecha: today, category_id: ID.otros, created_by: USERS.registra },
    { id: ID.gastoBorrado, book_id: b, descripcion: "Viejo", valor: 1000, fecha: today, created_by: USERS.owner, deleted_at: "2026-10-30T00:00:00Z" },
  ])
  s.seed("fixed_expenses", [{ id: ID.arriendo, book_id: b, nombre: "Arriendo", valor: 1200000, frec: "mensual", dia: day, category_id: ID.arriendoCat, link_type: null, inicio: null, payment_method_id: ID.efectivo }])
  s.seed("credit_cards", [{ id: ID.tarjeta, book_id: b, nombre: "Visa", cupo: 3000000, corte: 15, pago: 30 }])
  s.seed("subscriptions", [{ id: ID.sub, book_id: b, nombre: "Netflix", valor: 26900, ciclo: "mensual", proximo: today, activa: true }])
  s.seed("goals", [{ id: ID.meta, book_id: b, nombre: "Viaje", objetivo: 2000000, ahorrado: 100000 }])
  s.seed("assets", [{ id: ID.cuenta, book_id: b, nombre: "Ahorros", valor: 500000, cod: "1110" }])
  s.seed("emergency_funds", [{ book_id: b, activo: true, saldo: 300000, asset_id: null }])
  s.seed("entities", [{ id: uid(90), book_id: b, nombre: "Bancolombia", nit: "890903938", tipo: "Banco" }])
  s.seed("contacts", [{ id: uid(91), book_id: b, nombre: "Juan Pérez", doc: "1020304050", telefono: "", email: "", tipo: "persona" }])
  s.seed("providers", [{ id: uid(92), book_id: b, nombre: "Alkosto", nit: "" }])
  s.seed("loans", [{ id: ID.loan, book_id: b, kind: "pagar", tipo: "persona", concepto: "Préstamo", monto: 1000000, sistema: "simple", tasa: 0, frec: "mensual", plazo: 4, inicio: "2026-09-01", extra: 0, contact_id: uid(91) }])
  // Una categoría de OTRO libro con la que nadie de B_GRATIS debería poder escribir.
  s.seed("categories", [{ id: ID.ajena, book_id: uid(777), nombre: "Ajena", grupo: "g", sort: 1, tope: 0 }])
}
