// Acuerdo de pago y pagaré (buildAcuerdo de la v4) con @react-pdf/renderer. Se carga solo al generarlo.
import { Document, Page, StyleSheet, Text, View, pdf } from "@react-pdf/renderer"
import { FRECS, SISTEMAS, type LoanEngine, type Sistema } from "@/lib/domain"
import { fmtDate, fmtMoney, fmtPct, monthName } from "@/lib/format"
import { numLetras } from "@/lib/num-letras"
import { saveFile } from "@/lib/pwa/save-file"

export type Party = { nombre: string; doc: string; ciudad?: string; direccion?: string; telefono?: string }
export type AgreementInput = {
  kind: "cobrar" | "pagar"; yo: Party; otro: Party; ciudad: string; hoy: string
  monto: number; concepto: string; inicio: string; plazo: number; frec: string; sistema: string; tasa: number; ea: number; e: LoanEngine
}

const s = StyleSheet.create({
  page: { padding: 48, fontSize: 10, fontFamily: "Helvetica", lineHeight: 1.45, color: "#242424" },
  band: { position: "absolute", top: 0, left: 0, right: 0, height: 6, backgroundColor: "#9EDB4E" },
  title: { fontSize: 15, fontFamily: "Helvetica-Bold", textAlign: "center", marginBottom: 14, color: "#1F2B4B" },
  p: { marginBottom: 8, textAlign: "justify" },
  b: { fontFamily: "Helvetica-Bold" },
  h: { fontFamily: "Helvetica-Bold", fontSize: 11, marginTop: 10, marginBottom: 6, color: "#3F7A1E" },
  row: { flexDirection: "row", borderBottomWidth: 0.5, borderColor: "#D1D1D1", paddingVertical: 3 },
  th: { fontFamily: "Helvetica-Bold", backgroundColor: "#F0F0F0" },
  c: { flex: 1, textAlign: "right" }, c0: { width: 40 }, c1: { width: 90 },
  sign: { flexDirection: "row", gap: 24, marginTop: 36 },
  signBox: { flex: 1 }, line: { borderTopWidth: 1, borderColor: "#242424", marginTop: 40, paddingTop: 4 },
  huella: { width: 60, height: 70, borderWidth: 1, borderColor: "#999", marginTop: 8, fontSize: 7, color: "#999", textAlign: "center", paddingTop: 30 },
  foot: { position: "absolute", bottom: 24, left: 48, right: 48, fontSize: 8, color: "#888", textAlign: "center" },
})

function Agreement(d: AgreementInput) {
  const acreedor = d.kind === "cobrar" ? d.yo : d.otro
  const deudor = d.kind === "cobrar" ? d.otro : d.yo
  const [y, m, day] = d.hoy.split("-").map(Number)
  const party = (p: Party) => `${p.nombre}, identificado(a) con ${p.doc || "C.C. ______________"}${p.direccion ? `, con domicilio en ${p.direccion}` : ""}${p.telefono ? `, teléfono ${p.telefono}` : ""}`
  const per = FRECS[d.frec]?.n.toLowerCase() ?? "mensual"
  const sis = SISTEMAS[d.sistema as Sistema] ?? SISTEMAS.frances
  const rows = [
    ...d.e.hist.filter((h) => h.tipo === "cuota").map((h) => ({ n: (h as { n: number }).n, fecha: (h as { prog: string }).prog, valor: h.valor, int: h.int, saldo: h.saldo })),
    ...d.e.plan.map((p) => ({ n: p.n, fecha: p.fecha, valor: p.valor, int: p.int, saldo: p.saldo })),
  ]
  return (
    <Document title="Acuerdo de pago y pagaré" author="Mirai">
      <Page size="LETTER" style={s.page}>
        <View style={s.band} fixed />
        <Text style={s.title}>ACUERDO DE PAGO Y PAGARÉ</Text>
        <Text style={s.p}>En {d.ciudad || "__________"}, a los {day} días del mes de {monthName(m)} de {y}, comparecen: {party(acreedor)}, en adelante EL ACREEDOR; y {party(deudor)}, en adelante EL DEUDOR, quienes acuerdan lo siguiente:</Text>
        <Text style={s.p}><Text style={s.b}>PRIMERA. Objeto. </Text>EL DEUDOR declara que recibió de EL ACREEDOR, a título de préstamo, la suma de {fmtMoney(d.monto)} ({numLetras(d.monto).toUpperCase()} PESOS M/CTE){d.concepto ? `, destinada a ${d.concepto}` : ""}, el día {fmtDate(d.inicio, { long: true })}.</Text>
        <Text style={s.p}><Text style={s.b}>SEGUNDA. Forma de pago. </Text>EL DEUDOR pagará la suma prestada en {d.plazo} cuotas de periodicidad {per}, según el plan de pagos anexo, mediante el sistema de “{sis.n}” ({sis.t}).</Text>
        <Text style={s.p}><Text style={s.b}>TERCERA. Intereses. </Text>{d.tasa > 0
          ? `El préstamo causa un interés remuneratorio del ${fmtPct(d.tasa, 2)} mensual, equivalente a ${fmtPct(d.ea * 100, 2)} efectivo anual, sin superar la tasa máxima legal vigente. En caso de mora se causarán intereses moratorios a la tasa máxima permitida por la ley.`
          : "El préstamo NO causa intereses remuneratorios. En caso de mora se causarán intereses moratorios a la tasa máxima permitida por la ley."}</Text>
        <Text style={s.p}><Text style={s.b}>CUARTA. Pagos anticipados y cláusula aceleratoria. </Text>EL DEUDOR podrá pagar anticipadamente, total o parcialmente, sin penalidad. El incumplimiento en el pago de dos (2) o más cuotas faculta a EL ACREEDOR para declarar vencido el plazo y exigir el pago inmediato del saldo total.</Text>
        <Text style={s.p}><Text style={s.b}>QUINTA. Mérito ejecutivo. </Text>Este documento presta mérito ejecutivo. Se firma en dos ejemplares del mismo tenor, uno para cada parte.</Text>
        <Text style={s.h}>PLAN DE PAGOS</Text>
        <View style={[s.row, s.th]}><Text style={s.c0}>Cuota</Text><Text style={s.c1}>Fecha</Text><Text style={s.c}>Valor</Text><Text style={s.c}>Interés</Text><Text style={s.c}>Saldo</Text></View>
        {rows.map((r) => (
          <View key={`${r.n}-${r.fecha}`} style={s.row} wrap={false}><Text style={s.c0}>{r.n}</Text><Text style={s.c1}>{fmtDate(r.fecha)}</Text><Text style={s.c}>{fmtMoney(r.valor)}</Text><Text style={s.c}>{fmtMoney(r.int)}</Text><Text style={s.c}>{fmtMoney(r.saldo)}</Text></View>
        ))}
        <View style={s.sign} wrap={false}>
          {[["EL ACREEDOR", acreedor], ["EL DEUDOR", deudor]].map(([rol, p]) => (
            <View key={rol as string} style={s.signBox}>
              <Text style={s.line}>{rol as string}</Text>
              <Text>{(p as Party).nombre}</Text>
              <Text>{(p as Party).doc || "C.C. ______________"}</Text>
              <Text style={s.huella}>Huella</Text>
            </View>
          ))}
        </View>
        <Text style={s.foot} fixed>Modelo de referencia generado por Mirai. Para efectos legales se recomienda revisarlo con un abogado y autenticar las firmas en notaría.</Text>
      </Page>
    </Document>
  )
}

/** Genera el PDF y lo descarga. */
export async function downloadAgreement(d: AgreementInput, filename: string) {
  const blob = await pdf(<Agreement {...d} />).toBlob()
  await saveFile(blob, filename, "Acuerdo de pago")
}
