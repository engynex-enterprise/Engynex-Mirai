// La consola en el navegador. Servidor mínimo con node:http, SOLO en 127.0.0.1.
//
// Por qué no vive en apps/web: esta consola lee el disco, habla con Docker y abre SSH al VPS. Eso no puede
// estar en la aplicación que se despliega a producción, ni siquiera detrás de un permiso. Este servidor
// existe únicamente mientras lo corres a mano y muere con la terminal que lo lanzó.
import { spawn } from "node:child_process"
import { randomBytes } from "node:crypto"
import { readFile } from "node:fs/promises"
import { createServer, type IncomingMessage, type ServerResponse } from "node:http"
import { dirname, extname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { COMANDOS } from "../datos/comandos.ts"
import { cortar, cortarTodo, lanzar, verEjecucion } from "../datos/ejecucion.ts"
import { panel, type Panel, PANELES } from "../datos/index.ts"
import { identidad } from "../datos/repo.ts"
import { DOMINIO_POR_DEFECTO } from "../datos/salud-prod.ts"
import { saludVps } from "../datos/salud-vps.ts"

const AQUI = dirname(fileURLToPath(import.meta.url))
const ESTATICOS = join(AQUI, "estaticos")

const TIPOS: Record<string, string> = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".svg": "image/svg+xml",
  ".png": "image/png",
}

type Opciones = { puerto?: number; abrir?: boolean; dominio?: string }

const json = (res: ServerResponse, datos: unknown, codigo = 200) => {
  res.writeHead(codigo, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" })
  res.end(JSON.stringify(datos))
}

/** Lee el cuerpo de un POST, con tope para no tragarse cualquier cosa. */
async function cuerpo(req: IncomingMessage): Promise<Record<string, unknown>> {
  const trozos: Buffer[] = []
  let total = 0
  for await (const t of req) {
    total += (t as Buffer).length
    if (total > 64 * 1024) break
    trozos.push(t as Buffer)
  }
  try {
    return JSON.parse(Buffer.concat(trozos).toString() || "{}") as Record<string, unknown>
  } catch {
    return {}
  }
}

function abrirNavegador(url: string) {
  const cmd = process.platform === "darwin" ? "open" : process.platform === "win32" ? "start" : "xdg-open"
  try {
    spawn(cmd, [url], { detached: true, stdio: "ignore" }).unref()
  } catch {
    // Si no se puede abrir solo, el enlace ya quedó impreso en la terminal.
  }
}

export async function abrirWeb({ puerto = 4700, abrir = true, dominio = DOMINIO_POR_DEFECTO }: Opciones = {}) {
  // Token nuevo en cada arranque: ninguna otra página abierta en el navegador puede hablarle a este servidor.
  const token = randomBytes(16).toString("hex")
  const { version } = identidad()

  const servidor = createServer((req, res) => {
    void atender(req, res).catch(() => json(res, { error: "algo falló en la consola" }, 500))
  })

  async function atender(req: IncomingMessage, res: ServerResponse) {
    const url = new URL(req.url ?? "/", `http://127.0.0.1:${puerto}`)
    const ruta = url.pathname

    // Nada de CORS: solo responde a su propia página.
    const origen = req.headers.origin
    if (origen && origen !== `http://127.0.0.1:${puerto}` && origen !== `http://localhost:${puerto}`) {
      return json(res, { error: "origen no permitido" }, 403)
    }

    // Archivos de la página (no necesitan token: no llevan información del proyecto).
    if (ruta === "/" || ruta === "/index.html") return servirArchivo(res, "pagina.html", { token, version, dominio })
    if (/^\/[a-z-]+\.(css|js|svg)$/.test(ruta)) return servirArchivo(res, ruta.slice(1))

    // De aquí para abajo, todo exige el token.
    const suyo = req.headers["x-mirai-token"] ?? url.searchParams.get("t")
    if (suyo !== token) return json(res, { error: "sin permiso" }, 401)

    if (ruta === "/api/paneles") return json(res, { paneles: PANELES, comandos: COMANDOS, version, dominio })

    const m = /^\/api\/panel\/([a-z]+)$/.exec(ruta)
    if (m) {
      const id = m[1] as Panel
      if (!PANELES.some((p) => p.id === id)) return json(res, { error: "ese panel no existe" }, 404)
      return json(res, await panel(id, dominio))
    }

    if (ruta === "/api/salud/vps") return json(res, await saludVps())

    const lanzarM = /^\/api\/comandos\/([a-z0-9-]+)$/.exec(ruta)
    if (lanzarM && req.method === "POST") {
      const { confirmacion } = await cuerpo(req)
      // La confirmación se revisa en el motor, no en la página: vale igual desde la terminal.
      const r = lanzar(lanzarM[1], typeof confirmacion === "string" ? confirmacion : undefined)
      return r.ok ? json(res, { id: r.ejecucion.id }) : json(res, { error: r.msg }, 400)
    }

    const sseM = /^\/sse\/comandos\/([a-z0-9-]+)$/.exec(ruta)
    if (sseM) return seguirEjecucion(res, sseM[1])

    const cortarM = /^\/api\/comandos\/([a-z0-9-]+)$/.exec(ruta)
    if (cortarM && req.method === "DELETE") return json(res, { cortado: cortar(cortarM[1]) })

    return json(res, { error: "no existe" }, 404)
  }

  async function servirArchivo(res: ServerResponse, nombre: string, reemplazos?: Record<string, string>) {
    try {
      let txt = await readFile(join(ESTATICOS, nombre), "utf8")
      for (const [k, v] of Object.entries(reemplazos ?? {})) txt = txt.replaceAll(`{{${k}}}`, v)
      res.writeHead(200, { "content-type": TIPOS[extname(nombre)] ?? "text/plain", "cache-control": "no-store" })
      res.end(txt)
    } catch {
      res.writeHead(404).end("no está")
    }
  }

  /** La salida del comando en vivo, por Server-Sent Events. */
  function seguirEjecucion(res: ServerResponse, id: string) {
    const e = verEjecucion(id)
    if (!e) return json(res, { error: "esa ejecución no existe" }, 404)
    res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive" })
    const mandar = (tipo: string, datos: unknown) => res.write(`event: ${tipo}\ndata: ${JSON.stringify(datos)}\n\n`)
    mandar("historia", e.lineas)
    const alLinea = (l: unknown) => mandar("linea", l)
    const alFin = () => {
      mandar("fin", { code: e.code, estado: e.estado, ms: (e.fin ?? Date.now()) - e.inicio })
      res.end()
    }
    e.eventos.on("linea", alLinea)
    e.eventos.once("fin", alFin)
    if (e.estado !== "corriendo") alFin()
    res.on("close", () => {
      e.eventos.off("linea", alLinea)
      e.eventos.off("fin", alFin)
    })
  }

  await new Promise<void>((listo, falla) => {
    servidor.once("error", falla)
    // 127.0.0.1 y no 0.0.0.0: esto no sale de este computador.
    servidor.listen(puerto, "127.0.0.1", listo)
  })

  const url = `http://127.0.0.1:${puerto}/?t=${token}`
  console.log(`\n  Mirai 未来 — la consola, en el navegador\n\n  ${url}\n\n  Ctrl-C para apagarla.\n`)
  if (abrir) abrirNavegador(url)

  await new Promise<void>((resolver) => {
    const apagar = () => {
      cortarTodo()
      servidor.close(() => resolver())
      setTimeout(() => resolver(), 500)
    }
    process.on("SIGINT", apagar)
    process.on("SIGTERM", apagar)
  })
}
