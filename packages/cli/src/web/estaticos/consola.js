// La consola de Mirai en el navegador. JavaScript del navegador a secas: sin React y sin empaquetador,
// porque esta página es una herramienta de desarrollo y tiene que abrir aunque no haya internet.

const token = document.body.dataset.token
const ETIQUETA = { ok: "bien", aviso: "ojo", error: "mal", apagado: "sin consultar" }

const pedir = async (ruta, opciones = {}) => {
  const r = await fetch(ruta, {
    ...opciones,
    headers: { "x-mirai-token": token, ...(opciones.body ? { "content-type": "application/json" } : {}), ...opciones.headers },
  })
  if (!r.ok) throw new Error((await r.json().catch(() => ({}))).error ?? `error ${r.status}`)
  return r.json()
}

const el = (tag, clase, texto) => {
  const n = document.createElement(tag)
  if (clase) n.className = clase
  if (texto !== undefined) n.textContent = texto
  return n
}

const punto = (estado) => el("span", `punto punto--${estado}`)

// ── Estado de la página ────────────────────────────────────────────────────
let paneles = []
let comandos = []
let actual = "salud"
let cacheSalud = null

const $menu = document.getElementById("menu")
const $contenido = document.getElementById("contenido")
const $resumen = document.getElementById("resumen")

// ── Menú ───────────────────────────────────────────────────────────────────
function pintarMenu() {
  $menu.replaceChildren()
  paneles.forEach((p, i) => {
    const b = el("button", null)
    b.append(el("span", null, p.titulo), el("span", "atajo", String(i + 1)))
    b.setAttribute("aria-current", String(p.id === actual))
    b.title = p.descripcion
    b.onclick = () => ir(p.id)
    $menu.append(b)
  })
}

async function ir(id) {
  actual = id
  pintarMenu()
  location.hash = id
  $contenido.replaceChildren(el("div", "cargando", "Cargando…"))
  try {
    if (id === "salud") await pintarSalud()
    else if (id === "comandos") pintarComandos()
    else pintarSecciones(await pedir(`/api/panel/${id}`))
  } catch (e) {
    $contenido.replaceChildren(el("div", "cargando", `No pude cargarlo: ${e.message}`))
  }
}

// ── Paneles de información ─────────────────────────────────────────────────
function pintarSecciones({ secciones = [] }) {
  const frag = document.createDocumentFragment()
  for (const s of secciones) {
    const t = el("section", "tarjeta")
    const cab = el("div", "tarjeta-cabeza")
    cab.append(el("h2", null, s.titulo), el("p", null, s.descripcion))
    t.append(cab)
    const filas = el("div", "filas")
    let grupo
    for (const f of s.filas) {
      if (f.grupo && f.grupo !== grupo && f.grupo !== s.titulo) {
        grupo = f.grupo
        filas.append(el("div", "grupo", grupo))
      }
      const fila = el("div", "fila")
      fila.append(el("div", "n", f.nombre), el("div", "v", f.valor ?? ""), el("div", "d", f.detalle))
      filas.append(fila)
    }
    t.append(filas)
    frag.append(t)
  }
  $contenido.replaceChildren(frag)
}

// ── Salud ──────────────────────────────────────────────────────────────────
function tarjetaBloque(b, alConsultar) {
  const t = el("section", "tarjeta")
  const cab = el("div", "tarjeta-cabeza")
  const izq = el("div")
  const titulo = el("h2")
  titulo.append(punto(b.estado), " ", b.titulo, " ", el("span", "estado", ETIQUETA[b.estado]))
  izq.append(titulo, el("p", null, b.descripcion))
  cab.append(izq)
  if (b.aPulso) {
    const boton = el("button", "boton boton--suave", b.estado === "apagado" ? "Consultar por SSH" : "Volver a consultar")
    boton.onclick = () => alConsultar(boton)
    cab.append(boton)
  }
  t.append(cab)
  const filas = el("div", "filas")
  for (const c of b.chequeos) {
    const fila = el("div", "chequeo")
    fila.append(punto(c.estado), el("div", "t", c.titulo), el("div", "d", c.detalle), el("div", "ms", c.ms !== undefined ? `${c.ms} ms` : ""))
    filas.append(fila)
    if (c.arregla) filas.append(el("div", "arregla", `→ ${c.arregla}`))
  }
  t.append(filas)
  return t
}

async function pintarSalud(recargar = false) {
  if (recargar || !cacheSalud) cacheSalud = await pedir("/api/panel/salud")
  const bloques = cacheSalud.bloques ?? []
  const frag = document.createDocumentFragment()
  for (const b of bloques) {
    frag.append(
      tarjetaBloque(b, async (boton) => {
        boton.disabled = true
        boton.textContent = "Preguntando al servidor…"
        try {
          const vps = await pedir("/api/salud/vps")
          cacheSalud.bloques = bloques.map((x) => (x.id === "vps" ? vps : x))
          await pintarSalud()
        } catch (e) {
          boton.disabled = false
          boton.textContent = `No pude: ${e.message}`
        }
      }),
    )
  }
  $contenido.replaceChildren(frag)
  resumen(bloques)
}

function resumen(bloques) {
  const vivos = bloques.filter((b) => b.estado !== "apagado")
  const peor = vivos.some((b) => b.estado === "error") ? "error" : vivos.some((b) => b.estado === "aviso") ? "aviso" : "ok"
  $resumen.className = `pastilla pastilla--${peor}`
  $resumen.replaceChildren(punto(peor), peor === "ok" ? "todo bien" : peor === "aviso" ? "algo que mirar" : "algo está mal")
}

// ── Comandos ───────────────────────────────────────────────────────────────
function pintarComandos() {
  const frag = document.createDocumentFragment()
  const grupos = [...new Set(comandos.map((c) => c.grupo))]
  for (const g of grupos) {
    const t = el("section", "tarjeta")
    const cab = el("div", "tarjeta-cabeza")
    cab.append(el("h2", null, g))
    t.append(cab)
    for (const c of comandos.filter((x) => x.grupo === g)) {
      const fila = el("div", "comando")
      const izq = el("div")
      izq.append(el("div", "n", c.titulo), el("div", "d", c.detalle), el("div", "cmd", `${c.cmd} ${c.args.join(" ")}`))
      const boton = el("button", c.riesgo === "alto" ? "boton boton--peligro" : "boton", c.riesgo === "alto" ? "Correr…" : "Correr")
      boton.onclick = () => correr(c)
      const der = el("div")
      if (c.riesgo === "alto") der.append(el("div", "riesgo", "⚠ pide confirmación"))
      der.append(boton)
      fila.append(izq, der)
      t.append(fila)
    }
    frag.append(t)
  }
  $contenido.replaceChildren(frag)
}

async function correr(c) {
  let confirmacion
  if (c.riesgo === "alto") {
    confirmacion = await preguntarConfirmacion(c)
    if (confirmacion === null) return
  }
  try {
    const { id } = await pedir(`/api/comandos/${c.id}`, { method: "POST", body: JSON.stringify({ confirmacion }) })
    seguir(c, id)
  } catch (e) {
    const caja = el("p", "aviso-caja", e.message)
    $contenido.prepend(caja)
    setTimeout(() => caja.remove(), 5000)
  }
}

function preguntarConfirmacion(c) {
  const d = document.getElementById("confirmar")
  document.getElementById("confirmar-titulo").textContent = c.titulo
  document.getElementById("confirmar-texto").textContent = c.advertencia ?? ""
  document.getElementById("confirmar-palabra").textContent = c.confirmacion
  const campo = document.getElementById("confirmar-campo")
  campo.value = ""
  d.showModal()
  campo.focus()
  return new Promise((listo) => {
    d.addEventListener("close", () => listo(d.returnValue === "si" ? campo.value.trim() : null), { once: true })
  })
}

/** Sigue la salida del comando en vivo (SSE) y la pinta como una terminal. */
function seguir(c, id) {
  const t = el("section", "tarjeta")
  const cab = el("div", "tarjeta-cabeza")
  cab.append(el("h2", null, c.titulo), el("p", null, `${c.cmd} ${c.args.join(" ")}`))
  const cortar = el("button", "boton boton--suave", "Cortar")
  cortar.onclick = () => pedir(`/api/comandos/${id}`, { method: "DELETE" }).catch(() => {})
  cab.append(cortar)
  const salida = el("pre", "salida")
  const pie = el("p", "pie pie--corriendo", "corriendo…")
  t.append(cab, salida, pie)
  $contenido.replaceChildren(t)

  const linea = (l) => {
    const n = el("div", l.err ? "err" : null, l.texto)
    salida.append(n)
    salida.scrollTop = salida.scrollHeight
  }
  const es = new EventSource(`/sse/comandos/${id}?t=${token}`)
  es.addEventListener("historia", (e) => JSON.parse(e.data).forEach(linea))
  es.addEventListener("linea", (e) => linea(JSON.parse(e.data)))
  es.addEventListener("fin", (e) => {
    const { code, estado, ms } = JSON.parse(e.data)
    const bien = code === 0 && estado !== "cortado"
    pie.className = `pie pie--${bien ? "ok" : "error"}`
    pie.textContent = estado === "cortado" ? "Lo cortaste." : bien ? `✓ Listo en ${(ms / 1000).toFixed(1)} s` : `✗ Terminó con código ${code}`
    cortar.remove()
    es.close()
  })
  es.onerror = () => es.close()
}

// ── Arranque ───────────────────────────────────────────────────────────────
document.getElementById("refrescar").onclick = () => (actual === "salud" ? pintarSalud(true) : ir(actual))

document.addEventListener("keydown", (e) => {
  if (e.target.matches("input, textarea")) return
  const n = Number(e.key)
  if (n >= 1 && n <= paneles.length) ir(paneles[n - 1].id)
  if (e.key === "r") {
    if (actual === "salud") pintarSalud(true)
    else ir(actual)
  }
})

const inicio = await pedir("/api/paneles")
paneles = inicio.paneles
comandos = inicio.comandos
actual = paneles.some((p) => p.id === location.hash.slice(1)) ? location.hash.slice(1) : "salud"
pintarMenu()
await ir(actual)
