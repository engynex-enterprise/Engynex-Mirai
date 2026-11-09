// El stack real: versiones leídas de los package.json del workspace, no de un texto escrito a mano.
import { readdirSync } from "node:fs"
import { CAPAS, type Capa, PAQUETES, TECNOLOGIAS } from "./contenido.ts"
import { leerJson, type PaqueteJson, ruta } from "./raiz.ts"
import type { Fila, Seccion } from "./tipos.ts"

export type Paquete = { carpeta: string; nombre: string; version?: string; descripcion?: string; deps: Record<string, string> }

/** Todos los paquetes del workspace (apps/* y packages/*), más la raíz. */
export function paquetes(): Paquete[] {
  const out: Paquete[] = []
  const raiz = leerJson<PaqueteJson>("package.json")
  if (raiz) out.push({ carpeta: ".", nombre: raiz.name ?? "mirai", version: raiz.version, descripcion: raiz.description, deps: { ...raiz.dependencies, ...raiz.devDependencies } })
  for (const base of ["apps", "packages"]) {
    let carpetas: string[] = []
    try {
      carpetas = readdirSync(ruta(base), { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name)
    } catch {
      continue
    }
    for (const c of carpetas.sort()) {
      const pj = leerJson<PaqueteJson>(base, c, "package.json")
      if (!pj) continue
      out.push({ carpeta: `${base}/${c}`, nombre: pj.name ?? c, version: pj.version, descripcion: pj.description, deps: { ...pj.dependencies, ...pj.devDependencies } })
    }
  }
  return out
}

/** La versión instalada de una dependencia, buscándola en todos los paquetes. */
export function versionDe(dep: string, todos = paquetes()): string | undefined {
  for (const p of todos) {
    const v = p.deps[dep]
    if (v) return v.replace(/^[\^~]/, "")
  }
  return undefined
}

/** El stack agrupado por capa, con la versión real de cada cosa. */
export function stack(): Seccion {
  const todos = paquetes()
  const filas: Fila[] = []
  for (const capa of ["front", "api", "datos", "herramientas"] as Capa[]) {
    for (const t of TECNOLOGIAS.filter((x) => x.capa === capa)) {
      const v = versionDe(t.paquete, todos)
      if (!v) continue
      filas.push({ id: t.paquete, nombre: nombreBonito(t.paquete), valor: v, detalle: t.que, grupo: CAPAS[capa] })
    }
  }
  return { id: "stack", titulo: "Stack", descripcion: "Con qué está hecho Mirai, con la versión que hay instalada hoy.", filas }
}

/** Los paquetes del monorepo con su responsabilidad. */
export function monorepo(): Seccion {
  const filas: Fila[] = paquetes()
    .filter((p) => p.carpeta !== ".")
    .map((p) => ({
      id: p.carpeta,
      nombre: p.nombre,
      valor: p.carpeta,
      detalle: PAQUETES[p.nombre] ?? p.descripcion ?? "—",
      grupo: p.carpeta.startsWith("apps/") ? "Aplicaciones" : "Paquetes compartidos",
    }))
  return { id: "monorepo", titulo: "El monorepo", descripcion: "Qué hay en cada carpeta y de qué se encarga.", filas }
}

const BONITOS: Record<string, string> = {
  next: "Next.js",
  react: "React",
  "@tanstack/react-query": "TanStack Query",
  tailwindcss: "Tailwind CSS",
  "@radix-ui/react-dialog": "Radix UI (shadcn)",
  "react-hook-form": "React Hook Form",
  "@xyflow/react": "React Flow",
  "@nestjs/core": "NestJS",
  "better-auth": "Better Auth",
  "@ts-rest/core": "ts-rest",
  zod: "Zod",
  "socket.io": "Socket.IO",
  pg: "node-postgres",
  ioredis: "Redis (ioredis)",
  "@aws-sdk/client-s3": "S3 (AWS SDK)",
  turbo: "Turborepo",
  typescript: "TypeScript",
  vitest: "Vitest",
  "@playwright/test": "Playwright",
  eslint: "ESLint",
  ink: "Ink",
}

export const nombreBonito = (dep: string) => BONITOS[dep] ?? dep

/** La versión de Mirai y la rama, para el encabezado. */
export function identidad(): { version: string; nombre: string } {
  const raiz = leerJson<PaqueteJson>("package.json")
  return { version: raiz?.version ?? "?", nombre: raiz?.name ?? "mirai" }
}
