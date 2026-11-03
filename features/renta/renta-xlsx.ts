// Excel de la renta (rExcel de la v4) en .xlsx con exceljs, una hoja por tema.
import ExcelJS from "exceljs"
import { RDK, RIK, bValor, compraEstado, conv, depInfo, depsDe, inv, loanName, rLines, saldoPrestamoAl, type Renta, type patrimonio } from "@/lib/domain"
import { todayISO } from "@/lib/format"
import type { RentaData } from "./data"
import { saveFile } from "@/lib/pwa/save-file"

const BT: Record<string, string> = { inmueble: "Inmueble", vehiculo: "Vehículo", cuenta: "Cuenta", inversion: "Inversión", cripto: "Cripto", exterior: "Exterior", cobrar: "Por cobrar", otro: "Otro" }

export async function downloadRentaXlsx({ data, y, mid, C, P }: { data: RentaData; y: number; mid: string; C: Renta; P: ReturnType<typeof patrimonio> }, filename: string) {
  const today = todayISO(), trm = data.book.settings.trm, yr = String(y)
  const wb = new ExcelJS.Workbook()
  wb.creator = "Mirai"
  const sheet = (name: string, head: string[], rows: (string | number)[][]) => {
    const ws = wb.addWorksheet(name.slice(0, 30))
    ws.addRow(head).font = { bold: true, color: { argb: "FFFFFFFF" } }
    ws.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F2B4B" } }
    rows.forEach((r) => ws.addRow(r.map((v) => (typeof v === "number" ? Math.round(v) : v))))
    ws.columns.forEach((c, i) => { c.width = i === 0 ? 48 : 20; if (i > 0) c.numFmt = '#,##0' })
  }
  const tax = data.years.find((x) => x.year === y && x.member_id === mid)
  sheet("Borrador", ["Concepto", "Valor"], rLines(C))
  sheet("Ingresos", ["Concepto", "Valor"], RIK.map(([k, l]) => [l, (C as unknown as Record<string, number>)[k]]))
  sheet("Bienes", ["Tipo", "Nombre", "Identificación", "Entidad", "Costo fiscal", "Avalúo", "Saldo 31 dic", "%", "Valor a declarar"], P.B.map((b) => [BT[b.tipo] ?? b.tipo, b.nombre, b.ident ?? "", b.entidad ?? "", b.costo, b.avaluo, b.valor31, b.pct, (bValor(b) * b.pct) / 100]))
  sheet("Cuentas", ["Cuenta", "Moneda", "Valor"], data.book.assets.map((a) => [a.nombre ?? a.cod, a.currency ?? "COP", conv(a.valor, a.currency, trm)]))
  sheet("Inversiones", ["Inversión", "Capital", "Valor hoy", "Rendimientos", "Retención"], data.book.investments.map((x) => { const r = inv(x, today); return [x.nombre, x.capital, r.valor, r.bruto, r.ret] }))
  const corte = P.corte ?? today
  sheet(`Deudas al ${corte}`, ["Deuda", "Saldo"], [
    ...data.liabilitiesNamed.map((l) => [l.nombre, conv(l.valor, l.currency, trm)] as [string, number]),
    ...data.book.loans.filter((L) => L.kind === "pagar").map((L) => [L.concepto || loanName(L, data.book.contacts, data.book.entities), saldoPrestamoAl(L, corte)] as [string, number]),
    ...data.book.creditCards.map((t) => [`Tarjeta ${t.nombre}`, (t.purchases || []).filter((c) => c.fecha <= corte).reduce((a, c) => a + compraEstado(t, c, corte).saldo, 0)] as [string, number]).filter((r) => r[1] > 1),
  ])
  sheet("Dependientes", ["Nombre", "Documento", "Nacimiento", "Motivo"], depsDe(data.members, mid, today).map((m) => [m.nombre, m.doc ?? "", m.nacimiento ?? "", depInfo(m, today).why]))
  sheet("Deducciones", ["Concepto", "Valor"], RDK.map(([k, l]) => [l, +(tax?.ded?.[k] ?? 0) || C.dedAuto[k] || 0]))
  const cat = new Map(data.book.categories.map((c) => [c.id, c.nombre]))
  sheet(`Gastos ${y}`, ["Fecha", "Descripción", "Categoría", "Valor"], data.book.expenses.filter((g) => g.fecha.startsWith(yr)).sort((a, b) => a.fecha.localeCompare(b.fecha)).map((g) => [g.fecha, g.descripcion, cat.get(g.category_id ?? "") ?? "", +g.valor]))
  const buf = await wb.xlsx.writeBuffer()
  await saveFile(new Blob([buf], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }), filename, "Renta en Excel")
}
