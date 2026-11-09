// El CI y los despliegues: qué corrió, cómo quedó y por qué falló, sin salir de la consola.
import { correr, hay } from "./ejecutar.ts"
import type { Estado } from "./tipos.ts"

export type Corrida = {
  id: number
  nombre: string
  estado: Estado
  /** Qué pasó, en español. */
  resultado: string
  cuando: string
  rama: string
  commit: string
  url: string
  /** Si es el flujo de despliegue y no el de pruebas. */
  despliegue: boolean
}

type Crudo = {
  databaseId: number
  name: string
  status: string
  conclusion: string | null
  createdAt: string
  headBranch: string
  displayTitle: string
  url: string
}

const RESULTADO: Record<string, { texto: string; estado: Estado }> = {
  success: { texto: "pasó", estado: "ok" },
  failure: { texto: "falló", estado: "error" },
  timed_out: { texto: "se demoró demasiado", estado: "error" },
  startup_failure: { texto: "ni siquiera arrancó", estado: "error" },
  skipped: { texto: "no corrió (el paso anterior no pasó)", estado: "aviso" },
  cancelled: { texto: "lo cancelaron", estado: "aviso" },
  action_required: { texto: "espera aprobación", estado: "aviso" },
}

/** Las últimas corridas del CI y del despliegue. */
export async function corridas(rama = "main", cuantas = 12): Promise<{ ok: boolean; msg?: string; corridas: Corrida[] }> {
  if (!(await hay("gh"))) return { ok: false, msg: "Necesito GitHub CLI para esto: brew install gh && gh auth login", corridas: [] }
  const r = await correr(
    "gh",
    ["run", "list", "--branch", rama, "--limit", String(cuantas), "--json", "databaseId,name,status,conclusion,createdAt,headBranch,displayTitle,url"],
    { ms: 15000 },
  )
  if (!r.ok) return { ok: false, msg: "GitHub CLI no respondió (¿la sesión venció? gh auth login)", corridas: [] }
  let crudas: Crudo[] = []
  try {
    crudas = JSON.parse(r.out) as Crudo[]
  } catch {
    return { ok: false, msg: "No entendí la respuesta de GitHub.", corridas: [] }
  }
  return {
    ok: true,
    corridas: crudas.map((c): Corrida => {
      const corriendo = c.status !== "completed"
      const res = c.conclusion ? RESULTADO[c.conclusion] : undefined
      return {
        id: c.databaseId,
        nombre: c.name,
        estado: corriendo ? "aviso" : (res?.estado ?? "error"),
        resultado: corriendo ? "corriendo ahora" : (res?.texto ?? c.conclusion ?? "sin resultado"),
        cuando: new Date(c.createdAt).toLocaleString("es-CO", { dateStyle: "short", timeStyle: "short" }),
        rama: c.headBranch,
        commit: c.displayTitle,
        url: c.url,
        despliegue: /desplegar|deploy/i.test(c.name),
      }
    }),
  }
}

/** El registro del paso que falló, recortado a lo último (que es donde está el error). */
export async function porQueFallo(id: number, lineas = 120): Promise<string[]> {
  const r = await correr("gh", ["run", "view", String(id), "--log-failed"], { ms: 40000 })
  const texto = r.out || r.err
  if (!texto) return ["No hay registro de fallo para esa corrida (quizá no falló, o GitHub ya lo borró)."]
  // El log de gh trae "trabajo\tpaso\tlínea": se deja solo la línea.
  const limpias = texto.split("\n").map((l) => l.split("\t").slice(2).join("\t") || l)
  return limpias.slice(-lineas)
}

/** Lo último que se publicó: la corrida de despliegue más reciente que pasó. */
export function ultimoDespliegue(cs: Corrida[]): Corrida | undefined {
  return cs.find((c) => c.despliegue && c.estado === "ok")
}
