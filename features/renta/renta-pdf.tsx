// Informe para la declaración de renta (rInforme de la v4) con @react-pdf/renderer.
import { Document, Page, StyleSheet, Text, View, pdf } from "@react-pdf/renderer"
import { RDK, RDOCS, RIK, depInfo, depsDe, rLines, type RentaInput, type Renta, type patrimonio, type topes } from "@/lib/domain"
import { fmtDate, fmtMoney, todayISO } from "@/lib/format"
import type { RentaData } from "./data"

type In = { data: RentaData; y: number; mid: string; quien: string; R: RentaInput; C: Renta; P: ReturnType<typeof patrimonio>; T: ReturnType<typeof topes>; docs: Record<string, boolean> }

const s = StyleSheet.create({
  page: { padding: 40, paddingBottom: 50, fontSize: 9.5, fontFamily: "Helvetica", color: "#1F2B4B" },
  title: { fontSize: 16, fontFamily: "Helvetica-Bold" }, sub: { color: "#616161", marginTop: 3 },
  h: { fontSize: 11.5, fontFamily: "Helvetica-Bold", marginTop: 14, marginBottom: 4, paddingBottom: 3, borderBottomWidth: 2, borderColor: "#9EDB4E" },
  row: { flexDirection: "row", paddingVertical: 2.5, borderBottomWidth: 0.5, borderColor: "#E0E0E0" },
  l: { flex: 1, color: "#242424" }, v: { width: 150, textAlign: "right" }, b: { fontFamily: "Helvetica-Bold" },
  foot: { position: "absolute", bottom: 20, left: 40, right: 40, fontSize: 8, color: "#888", textAlign: "center" },
})
const $ = (v: number) => fmtMoney(Math.round(v))
const Row = ({ l, v, b }: { l: string; v: string; b?: boolean }) => <View style={s.row} wrap={false}><Text style={[s.l, b ? s.b : {}]}>{l}</Text><Text style={[s.v, b ? s.b : {}]}>{v}</Text></View>

function Informe({ data, y, mid, quien, C, P, T, docs }: In) {
  const today = todayISO()
  const deps = depsDe(data.members, mid, today)
  return (
    <Document title={`Renta ${y}`} author="Mirai">
      <Page size="LETTER" style={s.page}>
        <Text style={s.title}>Información para la declaración de renta {y}</Text>
        <Text style={s.sub}>{quien} · Generado por Mirai el {fmtDate(today, { long: true, year: true })} · UVT {$(C.U)}</Text>
        <Text style={s.h}>¿Debe declarar?</Text>
        {T.map((t) => <Row key={t.l} l={t.l} v={`${$(t.v)}${t.pasa ? " · SUPERA" : ""}`} />)}
        <Text style={s.h}>Ingresos, aportes y retenciones</Text>
        {RIK.map(([k, l]) => <Row key={k} l={l} v={$((C as unknown as Record<string, number>)[k])} />)}
        <Text style={s.h}>Patrimonio al 31 de diciembre</Text>
        {P.B.map((b) => <Row key={b.id ?? b.nombre} l={`${b.nombre}${b.ident ? ` · ${b.ident}` : ""} (${b.pct}%)`} v={$((Math.max(0, b.tipo === "inmueble" ? Math.max(b.costo, b.avaluo) : b.valor31 || b.costo || b.avaluo) * b.pct) / 100)} />)}
        <Row l="Cuentas y efectivo" v={$(P.cuentas)} /><Row l="Inversiones" v={$(P.invs)} /><Row l="Cuentas por cobrar" v={$(P.cobr)} /><Row l="Otros bienes" v={$(P.otrosAct)} />
        <Row l="Patrimonio bruto" v={$(P.bruto)} b /><Row l="Deudas" v={$(P.deudas)} /><Row l="Patrimonio líquido" v={$(P.liquido)} b />
        <Text style={s.h}>Dependientes</Text>
        {deps.length ? deps.map((m) => <Row key={m.id} l={`${m.nombre}${m.doc ? ` · ${m.doc}` : ""}`} v={depInfo(m, today).why} />) : <Text>Ninguno</Text>}
        <Text style={s.h}>Deducciones</Text>
        {RDK.map(([k, l]) => <Row key={k} l={l} v={$(+(data.years.find((x) => x.year === y && x.member_id === mid)?.ded?.[k] ?? 0))} />)}
        <Text style={s.h}>Borrador del impuesto (estimado)</Text>
        {rLines(C).map(([l, v]) => <Row key={l} l={l} v={$(v)} b={l.startsWith("=")} />)}
        <Text style={s.h}>Documentos</Text>
        {RDOCS.map(([k, l]) => <Row key={k} l={l} v={docs[k] || data.attachments.some((a) => a.doc_key === k && a.year === y) ? "Listo" : "Pendiente"} />)}
        <Text style={s.foot} fixed>Estimación orientativa. El valor final lo determina el contador. · Mirai</Text>
      </Page>
    </Document>
  )
}

export async function downloadRentaPdf(d: In, filename: string) {
  const blob = await pdf(<Informe {...d} />).toBlob()
  const a = Object.assign(document.createElement("a"), { href: URL.createObjectURL(blob), download: filename })
  a.click(); setTimeout(() => URL.revokeObjectURL(a.href), 2000)
}
