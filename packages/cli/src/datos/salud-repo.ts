// Salud del repositorio: qué tienes sin guardar, sin subir, y cómo quedó el último despliegue.
import { correr, hay } from "./ejecutar.ts"
import { type Bloque, type Chequeo, peorEstado } from "./tipos.ts"

async function git(): Promise<Chequeo[]> {
  const [rama, estado, pendientes] = await Promise.all([
    correr("git", ["rev-parse", "--abbrev-ref", "HEAD"], { ms: 3000 }),
    correr("git", ["status", "--porcelain"], { ms: 5000 }),
    correr("git", ["log", "--oneline", "@{u}..HEAD"], { ms: 5000 }),
  ])
  const sucios = estado.out.split("\n").filter(Boolean).length
  const sinSubir = pendientes.ok ? pendientes.out.split("\n").filter(Boolean).length : 0
  return [
    {
      id: "rama",
      titulo: "Rama",
      estado: rama.out === "main" ? "aviso" : "ok",
      detalle: rama.ok ? (rama.out === "main" ? "main — ojo: lo que subas aquí se va a producción" : rama.out) : "no pude leerla",
    },
    {
      id: "sucios",
      titulo: "Sin guardar",
      estado: sucios === 0 ? "ok" : "aviso",
      detalle: sucios === 0 ? "el árbol está limpio" : `${sucios} archivo${sucios === 1 ? "" : "s"} con cambios sin commitear`,
    },
    {
      id: "sin-subir",
      titulo: "Sin subir",
      estado: sinSubir === 0 ? "ok" : "aviso",
      detalle: pendientes.ok ? (sinSubir === 0 ? "todo está en el remoto" : `${sinSubir} commit${sinSubir === 1 ? "" : "s"} esperando push`) : "la rama no tiene remoto",
    },
  ]
}

async function ci(): Promise<Chequeo[]> {
  if (!(await hay("gh"))) {
    return [{ id: "ci", titulo: "CI y despliegue", estado: "apagado", detalle: "no tengo GitHub CLI para preguntar", arregla: "brew install gh && gh auth login" }]
  }
  const r = await correr("gh", ["run", "list", "--branch", "main", "--limit", "5", "--json", "name,status,conclusion,createdAt"], { ms: 12000 })
  if (!r.ok) return [{ id: "ci", titulo: "CI y despliegue", estado: "apagado", detalle: "GitHub CLI no respondió (¿sesión vencida?)", arregla: "gh auth login" }]
  let corridas: { name: string; status: string; conclusion: string | null; createdAt: string }[] = []
  try {
    corridas = JSON.parse(r.out)
  } catch {
    return [{ id: "ci", titulo: "CI y despliegue", estado: "apagado", detalle: "no entendí la respuesta de GitHub" }]
  }
  const mostrar = (nombre: string, filtro: (n: string) => boolean): Chequeo => {
    const c = corridas.find((x) => filtro(x.name))
    if (!c) return { id: nombre, titulo: nombre, estado: "apagado", detalle: "sin corridas recientes en main" }
    const cuando = new Date(c.createdAt).toLocaleString("es-CO", { dateStyle: "short", timeStyle: "short" })
    if (c.status !== "completed") return { id: nombre, titulo: nombre, estado: "aviso", detalle: `corriendo ahora (${cuando})` }
    // "skipped" y "cancelled" no son un fallo: es que no llegó a correr (p. ej. el despliegue cuando el CI falló).
    const NO_CORRIO: Record<string, string> = { skipped: "no corrió (el paso anterior no pasó)", cancelled: "lo cancelaron" }
    if (c.conclusion && NO_CORRIO[c.conclusion]) {
      return { id: nombre, titulo: nombre, estado: "aviso", detalle: `${NO_CORRIO[c.conclusion]} · ${cuando}` }
    }
    return {
      id: nombre,
      titulo: nombre,
      estado: c.conclusion === "success" ? "ok" : "error",
      detalle: `${c.conclusion === "success" ? "pasó" : `falló (${c.conclusion})`} · ${cuando}`,
      arregla: c.conclusion === "success" ? undefined : "gh run view --log-failed --branch main",
    }
  }
  return [mostrar("CI", (n) => !/desplegar/i.test(n)), mostrar("Despliegue", (n) => /desplegar/i.test(n))]
}

export async function saludRepo(): Promise<Bloque> {
  const [g, c] = await Promise.all([git(), ci()])
  const chequeos = [...g, ...c]
  return {
    id: "repo",
    titulo: "Repositorio y CI",
    descripcion: "Tu copia del código y cómo quedó lo último que se subió.",
    estado: peorEstado(chequeos.map((x) => x.estado)),
    chequeos,
  }
}
