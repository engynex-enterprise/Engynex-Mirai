// Reporte del mes en PDF (buildPDF de la v4) con @react-pdf/renderer. Se carga solo al generarlo.
import { Document, Page, StyleSheet, Text, View, pdf } from "@react-pdf/renderer"
import type { Indicador, ReportData } from "@/lib/domain"
import { fmtMoney } from "@/lib/format"

export type ReportPdfInput = {
  mes: string; libro: string; hoy: string; R: ReportData
  activos: [string, number][]; pasivos: [string, number][]
  ind: Indicador[]; prestamos: [string, number][]; cats: [string, number][]
}

const s = StyleSheet.create({
  page: { paddingBottom: 48, fontSize: 10, fontFamily: "Helvetica", color: "#242424" },
  head: { backgroundColor: "#1F2B4B", height: 86, paddingHorizontal: 40, justifyContent: "center" },
  band: { backgroundColor: "#9EDB4E", height: 5 },
  h1: { color: "#fff", fontSize: 20, fontFamily: "Helvetica-Bold" },
  sub: { color: "#fff", fontSize: 10.5, marginTop: 4, opacity: 0.85 },
  body: { paddingHorizontal: 40, paddingTop: 12 },
  h: { color: "#3F7A1E", fontSize: 12.5, fontFamily: "Helvetica-Bold", marginTop: 16, paddingBottom: 4, borderBottomWidth: 1, borderColor: "#3F7A1E", marginBottom: 4 },
  row: { flexDirection: "row", paddingVertical: 3, borderBottomWidth: 0.5, borderColor: "#E0E0E0" },
  l: { flex: 1 }, v: { width: 160, textAlign: "right" }, b: { fontFamily: "Helvetica-Bold" },
  foot: { position: "absolute", bottom: 20, left: 40, right: 40, fontSize: 8, color: "#888", textAlign: "center" },
})
const $ = (v: number) => fmtMoney(Math.round(v))
const Row = ({ l, v, bold }: { l: string; v: string; bold?: boolean }) => (
  <View style={s.row} wrap={false}><Text style={[s.l, bold ? s.b : {}]}>{l}</Text><Text style={[s.v, bold ? s.b : {}]}>{v}</Text></View>
)

function Report(d: ReportPdfInput) {
  const { R } = d
  return (
    <Document title={`Reporte ${d.mes}`} author="Mirai">
      <Page size="LETTER" style={s.page}>
        <View style={s.head}><Text style={s.h1}>Mirai Finanzas</Text><Text style={s.sub}>Reporte de {d.mes} · {d.libro} · {d.hoy}</Text></View>
        <View style={s.band} />
        <View style={s.body}>
          <Text style={s.h}>Lo que tengo y lo que debo</Text>
          {d.activos.map(([l, v]) => <Row key={`a${l}`} l={l} v={$(v)} />)}
          <Row l="Inversiones" v={$(R.T.xi)} /><Row l="Lo que me deben" v={$(R.T.xc)} /><Row l="Total activos" v={$(R.T.A)} bold />
          {d.pasivos.map(([l, v]) => <Row key={`p${l}`} l={l} v={$(v)} />)}
          <Row l="Créditos y préstamos" v={$(R.T.xp)} /><Row l="Total pasivos" v={$(R.T.P)} bold /><Row l="Patrimonio" v={$(R.T.pat)} bold />

          <Text style={s.h}>Resultado del mes</Text>
          <Row l="Ingresos" v={$(R.ing)} /><Row l="Necesidades" v={$(R.grp.n)} /><Row l="Gustos" v={$(R.grp.g)} />
          <Row l="Otros gastos" v={$(R.grp.x + R.grp.a)} /><Row l="Cuotas de créditos" v={$(R.cuo)} /><Row l="Suscripciones" v={$(R.sub)} />
          <Row l={R.res >= 0 ? "Te sobró" : "Te faltó"} v={$(R.res)} bold />

          <Text style={s.h}>Salud financiera</Text>
          {d.ind.filter((i) => i.ok).map((i) => <Row key={i.k} l={i.k} v={`${i.v} · ${i.st === "ok" ? "Sano" : i.st === "warn" ? "Vigilar" : "En riesgo"}`} />)}

          {d.prestamos.length > 0 && <><Text style={s.h}>Préstamos</Text>{d.prestamos.map(([l, v], i) => <Row key={`l${i}`} l={l} v={$(v)} />)}</>}
          <Text style={s.h}>Gastos por categoría</Text>
          {d.cats.map(([l, v], i) => <Row key={`c${i}`} l={l} v={$(v)} />)}
        </View>
        <Text style={s.foot} fixed render={({ pageNumber, totalPages }) => `Mirai · Tu futuro financiero · Página ${pageNumber} de ${totalPages}`} />
      </Page>
    </Document>
  )
}

export async function downloadReport(d: ReportPdfInput, filename: string) {
  const blob = await pdf(<Report {...d} />).toBlob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url; a.download = filename; a.click()
  setTimeout(() => URL.revokeObjectURL(url), 2000)
}
