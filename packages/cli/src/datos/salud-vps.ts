// Salud del VPS, por SSH. SOLO cuando se pide a mano: abrir SSH al entrar a la consola sería lento y molesto.
// Usa la misma llave y destino que infra/servidor/migrar.mjs, siempre con BatchMode (nunca pide contraseña).
import { homedir } from "node:os"
import { join } from "node:path"
import { correr } from "./ejecutar.ts"
import { type Bloque, type Chequeo, peorEstado } from "./tipos.ts"

export const DESTINO_SSH = "root@ssh.engynex.com"
export const LLAVE_SSH = join(homedir(), ".ssh/mirai_vps")

/** Todo en una sola sesión SSH: abrir varias sería lento y ruidoso. */
const GUION = [
  "echo '--contenedores'",
  "docker ps --format '{{.Names}}\\t{{.Status}}' 2>/dev/null | head -20",
  "echo '--disco'",
  "df -h / | tail -1",
  "echo '--memoria'",
  "free -m 2>/dev/null | sed -n 2p",
  "echo '--copia'",
  "ls -t /etc/dokploy/backups 2>/dev/null | head -1 || echo sin-datos",
].join("; ")

function trozo(salida: string, marca: string): string {
  const partes = salida.split(/^--/m)
  const p = partes.find((x) => x.startsWith(marca))
  return p ? p.slice(marca.length).trim() : ""
}

export function bloqueApagado(): Bloque {
  return {
    id: "vps",
    titulo: "VPS",
    descripcion: "El servidor de Hostinger con Dokploy. Se consulta por SSH solo cuando lo pides.",
    estado: "apagado",
    aPulso: true,
    chequeos: [{ id: "vps", titulo: "Sin consultar", estado: "apagado", detalle: "Entra aquí para preguntarle al servidor por SSH." }],
  }
}

export async function saludVps(destino = DESTINO_SSH, llave = LLAVE_SSH): Promise<Bloque> {
  const r = await correr("ssh", ["-i", llave, "-o", "BatchMode=yes", "-o", "ConnectTimeout=8", "-o", "StrictHostKeyChecking=accept-new", destino, GUION], { ms: 20000 })
  if (!r.ok) {
    const motivo = r.expiro ? "no respondió a tiempo" : /permission denied|publickey/i.test(r.err) ? "la llave no sirvió" : "no pude entrar"
    return {
      id: "vps",
      titulo: "VPS",
      descripcion: "El servidor de Hostinger con Dokploy.",
      estado: "error",
      aPulso: true,
      chequeos: [{ id: "ssh", titulo: "SSH", estado: "error", detalle: `${motivo} (${destino})`, ms: r.ms, arregla: `Revisa que exista ${llave} y que el servidor esté arriba.` }],
    }
  }
  const contenedores = trozo(r.out, "contenedores").split("\n").filter(Boolean)
  const arriba = contenedores.filter((l) => /\tUp /.test(l)).length
  const disco = trozo(r.out, "disco").split(/\s+/)
  const usoDisco = Number((disco[4] ?? "").replace("%", ""))
  const mem = trozo(r.out, "memoria").split(/\s+/)
  const totalMem = Number(mem[1] ?? 0)
  const usadaMem = Number(mem[2] ?? 0)
  const copia = trozo(r.out, "copia")

  const chequeos: Chequeo[] = [
    {
      id: "contenedores",
      titulo: "Contenedores",
      estado: contenedores.length === 0 ? "error" : arriba === contenedores.length ? "ok" : "aviso",
      detalle: contenedores.length === 0 ? "no hay ninguno corriendo" : `${arriba} de ${contenedores.length} arriba`,
      ms: r.ms,
    },
    {
      id: "disco",
      titulo: "Disco",
      estado: !usoDisco ? "apagado" : usoDisco >= 90 ? "error" : usoDisco >= 75 ? "aviso" : "ok",
      detalle: disco.length >= 5 ? `${disco[4]} usado · ${disco[3]} libre de ${disco[1]}` : "no pude leerlo",
      arregla: usoDisco >= 75 ? "docker system prune en el servidor, o amplía el disco." : undefined,
    },
    {
      id: "memoria",
      titulo: "Memoria",
      estado: !totalMem ? "apagado" : usadaMem / totalMem >= 0.9 ? "aviso" : "ok",
      detalle: totalMem ? `${usadaMem} MB usados de ${totalMem} MB` : "no pude leerla",
    },
    {
      id: "copia",
      titulo: "Última copia",
      estado: copia && copia !== "sin-datos" ? "ok" : "apagado",
      detalle: copia && copia !== "sin-datos" ? copia : "no encontré copias en la ruta de Dokploy",
    },
  ]
  return { id: "vps", titulo: "VPS", descripcion: `Hostinger + Dokploy (${destino}).`, estado: peorEstado(chequeos.map((c) => c.estado)), aPulso: true, chequeos }
}

/** Migraciones de la base del VPS que faltan por aplicar (abre su propio túnel; tarda). */
export async function migracionesPendientes(): Promise<Chequeo> {
  const r = await correr("node", ["infra/servidor/migrar.mjs", "--pendientes"], { ms: 60000 })
  if (!r.ok) return { id: "migraciones", titulo: "Migraciones", estado: "apagado", detalle: "no pude consultarlas (necesita el túnel SSH y los secretos del servidor)", ms: r.ms }
  const faltan = r.out.includes("No falta ninguna")
  return {
    id: "migraciones",
    titulo: "Migraciones",
    estado: faltan ? "ok" : "aviso",
    detalle: faltan ? "la base del VPS está al día" : r.out.split("\n").filter((l) => l.startsWith("Faltan")).join(" ") || "hay migraciones pendientes",
    ms: r.ms,
    arregla: faltan ? undefined : "pnpm db:migrate:vps",
  }
}
