// Conversación del chat en PDF con @react-pdf/renderer. Se carga solo al descargar (import dinámico).
import { Document, Page, StyleSheet, Text, View, pdf } from "@react-pdf/renderer"
import { plainText } from "@/lib/chat/markdown"
import { saveFile } from "@/lib/pwa/save-file"

type Msg = { role: string; content: string; created_at: string }

const s = StyleSheet.create({
  page: { paddingBottom: 48, fontSize: 10.5, fontFamily: "Helvetica", color: "#1C2B33" },
  head: { backgroundColor: "#1F2B4B", paddingHorizontal: 40, paddingVertical: 22 },
  band: { backgroundColor: "#9EDB4E", height: 5 },
  h1: { color: "#fff", fontSize: 18, fontFamily: "Helvetica-Bold" },
  sub: { color: "#fff", fontSize: 9.5, marginTop: 4, opacity: 0.85 },
  body: { paddingHorizontal: 40, paddingTop: 14 },
  who: { fontSize: 9, fontFamily: "Helvetica-Bold", marginTop: 10, marginBottom: 3 },
  user: { backgroundColor: "#E7F5D9", borderRadius: 8, padding: 8 },
  bot: { backgroundColor: "#F0F2F5", borderRadius: 8, padding: 8 },
  foot: { position: "absolute", bottom: 20, left: 40, right: 40, fontSize: 8, color: "#888", textAlign: "center" },
})
const when = (iso: string) => { try { return new Date(iso).toLocaleString("es-CO", { dateStyle: "medium", timeStyle: "short" }) } catch { return "" } }

function Chat({ titulo, msgs }: { titulo: string; msgs: Msg[] }) {
  return (
    <Document title={titulo} author="Mirai">
      <Page size="LETTER" style={s.page}>
        <View style={s.head}><Text style={s.h1}>{titulo}</Text><Text style={s.sub}>Conversación con Mirai · {when(msgs[0]?.created_at ?? new Date().toISOString())}</Text></View>
        <View style={s.band} />
        <View style={s.body}>
          {msgs.map((m, i) => (
            <View key={i} wrap>
              <Text style={[s.who, { color: m.role === "user" ? "#2A7F14" : "#1F2B4B" }]}>{m.role === "user" ? "Tú" : "Mirai"} · {when(m.created_at)}</Text>
              <View style={m.role === "user" ? s.user : s.bot}><Text>{plainText(m.content).replace(/^\s*[-*]\s+/gm, "• ")}</Text></View>
            </View>
          ))}
        </View>
        <Text style={s.foot} fixed render={({ pageNumber, totalPages }) => `Mirai · Orientación con tus datos, no reemplaza a un asesor certificado · ${pageNumber} / ${totalPages}`} />
      </Page>
    </Document>
  )
}

export async function downloadChatPdf(titulo: string, msgs: Msg[], filename: string) {
  const blob = await pdf(<Chat titulo={titulo} msgs={msgs} />).toBlob()
  await saveFile(blob, filename, titulo)
}
