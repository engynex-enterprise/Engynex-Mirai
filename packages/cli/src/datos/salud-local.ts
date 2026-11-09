// Salud de este computador: Docker, puertos, herramientas y variables de entorno.
import { correr, hay, puertoOcupado } from "./ejecutar.ts"
import { existe, leer, leerJson, type PaqueteJson } from "./raiz.ts"
import { type Bloque, type Chequeo, peorEstado } from "./tipos.ts"

/** Los puertos del arnés local (infra/local/README.md). */
export const PUERTOS: { puerto: number; que: string }[] = [
  { puerto: 55300, que: "web" },
  { puerto: 55080, que: "API" },
  { puerto: 55081, que: "tiempo real" },
  { puerto: 55432, que: "base" },
  { puerto: 55430, que: "PostgREST" },
  { puerto: 55379, que: "Redis" },
  { puerto: 55900, que: "archivos (MinIO)" },
]

/** Las variables que la .env.local debería tener, sacadas de .env.example. */
export function variablesEsperadas(): string[] {
  const txt = leer(".env.example")
  if (!txt) return []
  return [...new Set([...txt.matchAll(/^\s*([A-Z][A-Z0-9_]+)\s*=/gm)].map((m) => m[1]))].sort()
}

/** Las que están definidas en .env.local (solo los nombres: el valor nunca se lee para mostrarlo). */
export function variablesDefinidas(): Set<string> {
  const txt = leer(".env.local")
  if (!txt) return new Set()
  return new Set([...txt.matchAll(/^\s*([A-Z][A-Z0-9_]+)\s*=/gm)].map((m) => m[1]))
}

async function versiones(): Promise<Chequeo[]> {
  const pj = leerJson<PaqueteJson>("package.json")
  const pideNode = pj?.engines?.node ?? ">=20"
  const [node, pnpm, docker] = await Promise.all([
    correr("node", ["--version"], { ms: 2000 }),
    correr("pnpm", ["--version"], { ms: 4000 }),
    correr("docker", ["--version"], { ms: 4000 }),
  ])
  const mayor = Number((node.out.match(/v(\d+)/)?.[1] ?? "0"))
  const minimo = Number(pideNode.match(/(\d+)/)?.[1] ?? "20")
  return [
    {
      id: "node",
      titulo: "Node",
      estado: mayor >= minimo ? "ok" : "error",
      detalle: node.ok ? `${node.out} (el proyecto pide ${pideNode})` : "no pude leer la versión",
      arregla: mayor >= minimo ? undefined : `Instala Node ${pideNode}.`,
    },
    { id: "pnpm", titulo: "pnpm", estado: pnpm.ok ? "ok" : "error", detalle: pnpm.ok ? pnpm.out : "no está", arregla: pnpm.ok ? undefined : "corepack enable" },
    {
      id: "docker",
      titulo: "Docker",
      estado: docker.ok ? "ok" : "aviso",
      detalle: docker.ok ? docker.out.replace("Docker version ", "") : "no está instalado o no responde",
      arregla: docker.ok ? undefined : "Abre Docker Desktop (sin él no corre el stack local).",
    },
  ]
}

async function contenedores(): Promise<Chequeo> {
  if (!(await hay("docker"))) return { id: "docker-ps", titulo: "Contenedores", estado: "apagado", detalle: "sin Docker no puedo mirar" }
  const r = await correr("docker", ["ps", "--format", "{{.Names}}\t{{.Status}}"], { ms: 6000 })
  if (!r.ok) return { id: "docker-ps", titulo: "Contenedores", estado: "aviso", detalle: "Docker no respondió (¿está abierto?)", arregla: "Abre Docker Desktop." }
  const lineas = r.out.split("\n").filter(Boolean)
  // Solo los de ESTE proyecto: la máquina puede tener contenedores de otros con nombres parecidos.
  const mios = lineas.filter((l) => /^mirai-(local|cprueba|supa)/i.test(l))
  if (!mios.length) return { id: "docker-ps", titulo: "Contenedores", estado: "apagado", detalle: "ninguno del stack local está arriba", arregla: "pnpm local:up" }
  const arriba = mios.filter((l) => /\tUp /.test(l)).length
  return {
    id: "docker-ps",
    titulo: "Contenedores",
    estado: arriba === mios.length ? "ok" : "aviso",
    detalle: `${arriba} de ${mios.length} arriba: ${mios.map((l) => l.split("\t")[0]).join(", ")}`,
  }
}

async function puertos(): Promise<Chequeo[]> {
  const estados = await Promise.all(PUERTOS.map(async (p) => ({ ...p, ocupado: await puertoOcupado(p.puerto) })))
  const arriba = estados.filter((e) => e.ocupado)
  const out: Chequeo[] = [
    {
      id: "puertos",
      titulo: "Puertos del stack",
      estado: arriba.length === 0 ? "apagado" : arriba.length === estados.length ? "ok" : "aviso",
      detalle: estados.map((e) => `${e.ocupado ? "●" : "○"} ${e.puerto} ${e.que}`).join("  "),
      arregla: arriba.length === 0 ? "pnpm local:up (o pnpm dev para todo)" : undefined,
    },
  ]
  // El clásico: un `next start` viejo en 3100 que Playwright reutiliza y sirve una compilación que ya no existe.
  if (await puertoOcupado(3100)) {
    out.push({
      id: "zombi",
      titulo: "Proceso viejo en 3100",
      estado: "aviso",
      detalle: "hay algo escuchando en 3100: Playwright lo reutilizaría y serviría una compilación vieja",
      arregla: "lsof -ti:3100 | xargs kill",
    })
  }
  return out
}

function entorno(): Chequeo[] {
  const out: Chequeo[] = []
  const hayEnv = existe(".env.local")
  out.push({
    id: "env",
    titulo: ".env.local",
    estado: hayEnv ? "ok" : "error",
    detalle: hayEnv ? "está en la raíz" : "no está",
    arregla: hayEnv ? undefined : "Copia .env.example a .env.local y llénala.",
  })
  if (hayEnv) {
    const esperadas = variablesEsperadas()
    const definidas = variablesDefinidas()
    const faltan = esperadas.filter((v) => !definidas.has(v))
    out.push({
      id: "env-vars",
      titulo: "Variables",
      estado: faltan.length === 0 ? "ok" : "aviso",
      // Solo los NOMBRES. El valor de una variable no se lee nunca para mostrarlo.
      detalle: faltan.length === 0 ? `las ${esperadas.length} de .env.example están definidas` : `faltan ${faltan.length}: ${faltan.slice(0, 6).join(", ")}${faltan.length > 6 ? "…" : ""}`,
    })
  }
  const enlace = existe("apps/web/.env.local")
  out.push({
    id: "enlace",
    titulo: "Enlace de la web",
    estado: enlace ? "ok" : "aviso",
    detalle: enlace ? "apps/web/.env.local apunta a la raíz" : "falta el enlace simbólico",
    arregla: enlace ? undefined : "ln -s ../../.env.local apps/web/.env.local",
  })
  // Sin MIRAI_API_URL la web no arranca nada (apiConfig() lanza un error claro).
  const tieneApi = variablesDefinidas().has("MIRAI_API_URL") || process.env.MIRAI_API_URL !== undefined
  out.push({
    id: "api-url",
    titulo: "MIRAI_API_URL",
    estado: tieneApi ? "ok" : "aviso",
    detalle: tieneApi ? "definida" : "falta (pnpm dev la pone sola; dev:web la necesita a mano)",
  })
  return out
}

export async function saludLocal(): Promise<Bloque> {
  const [vs, cont, ps] = await Promise.all([versiones(), contenedores(), puertos()])
  const chequeos = [...vs, cont, ...ps, ...entorno()]
  return {
    id: "local",
    titulo: "Local",
    descripcion: "Este computador: herramientas, contenedores, puertos y variables.",
    estado: peorEstado(chequeos.map((c) => c.estado)),
    chequeos,
  }
}
