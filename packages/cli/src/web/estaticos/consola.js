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
let refrescoAmbientes = null
let actual = "salud"
let cacheSalud = null

const $menu = document.getElementById("menu")
const $contenido = document.getElementById("contenido")
const $resumen = document.getElementById("resumen")

// ── Menú ───────────────────────────────────────────────────────────────────
function pintarMenu() {
  $menu.replaceChildren()
  let grupo
  paneles.forEach((p, i) => {
    if (p.grupo && p.grupo !== grupo) {
      grupo = p.grupo
      $menu.append(el("div", "menu-grupo", grupo))
    }
    const b = el("button", null)
    b.append(el("span", null, p.titulo), el("span", "atajo", i < 9 ? String(i + 1) : ""))
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
  clearInterval(refrescoAmbientes)
  if (logAbierto) {
    logAbierto.close()
    logAbierto = null
  }
  try {
    if (id === "salud") await pintarSalud()
    else if (id === "comandos") pintarComandos()
    else if (id === "ambientes") await pintarAmbientes()
    else if (id === "registros") await pintarRegistros()
    else if (id === "recursos") await pintarRecursos()
    else if (id === "base") await pintarBase()
    else if (id === "pruebas") await pintarPruebas()
    else if (id === "git") await pintarGit()
    else if (id === "despliegue") await pintarDespliegue()
    else if (id === "endpoints") await pintarEndpoints()
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

function resumenAmbientes(ambientes) {
  const arriba = ambientes.filter((a) => a.estado !== "apagado")
  const peor = arriba.some((a) => a.estado === "aviso") ? "aviso" : arriba.length ? "ok" : "apagado"
  $resumen.className = `pastilla pastilla--${peor}`
  $resumen.replaceChildren(punto(peor), arriba.length ? `${arriba.length} ambiente${arriba.length > 1 ? "s" : ""} arriba` : "nada corriendo")
}

function resumen(bloques) {
  const vivos = bloques.filter((b) => b.estado !== "apagado")
  const peor = vivos.some((b) => b.estado === "error") ? "error" : vivos.some((b) => b.estado === "aviso") ? "aviso" : "ok"
  $resumen.className = `pastilla pastilla--${peor}`
  $resumen.replaceChildren(punto(peor), peor === "ok" ? "todo bien" : peor === "aviso" ? "algo que mirar" : "algo está mal")
}


// ── Ambientes ──────────────────────────────────────────────────────────────
async function pintarAmbientes() {
  const { ambientes } = await pedir("/api/panel/ambientes")
  const frag = document.createDocumentFragment()
  for (const it of ambientes) {
    const a = it.ambiente
    const arriba = it.estado !== "apagado"
    const t = el("section", "tarjeta")
    const cab = el("div", "tarjeta-cabeza")
    const izq = el("div")
    const titulo = el("h2")
    titulo.append(punto(it.estado), " ", a.titulo)
    const sub = el("p")
    sub.append(el("span", `estado estado--${it.estado}`, it.resumen))
    izq.append(titulo, sub, el("p", null, a.detalle), el("p", "sutil", a.cuando))
    const acciones = el("div", "acciones")
    if (arriba && a.url) {
      const abrir = el("a", "boton boton--suave", "Abrir")
      abrir.href = a.url
      abrir.target = "_blank"
      abrir.rel = "noreferrer"
      acciones.append(abrir)
    }
    if (arriba) {
      const b = el("button", "boton boton--suave", "Apagar")
      b.onclick = () => apagarAmbiente(a, b)
      acciones.append(b)
    }
    if (!arriba) {
      const b = el("button", "boton", "Levantar")
      b.onclick = () => levantar(a)
      acciones.append(b)
    }
    cab.append(izq, acciones)
    t.append(cab)

    const puertos = el("div", "puertos")
    for (const p of it.puertos) {
      const chip = el("span", `chip ${p.ocupado ? "chip--on" : "chip--off"}`)
      chip.append(punto(p.ocupado ? "ok" : "apagado"), `${p.puerto} ${p.que}`)
      if (p.ocupado) {
        chip.title = `Liberar el puerto ${p.puerto}`
        chip.classList.add("chip--accion")
        chip.onclick = () => liberar(p.puerto)
      }
      puertos.append(chip)
    }
    t.append(puertos)
    if (!arriba) t.append(el("p", "aviso-caja", `Tarda ${a.tarda}.`))
    frag.append(t)
  }
  $contenido.replaceChildren(frag)
  resumenAmbientes(ambientes)
  // Mientras algo arranca, el estado se vuelve a mirar solo.
  clearInterval(refrescoAmbientes)
  refrescoAmbientes = setInterval(() => {
    if (actual === "ambientes" && !document.hidden) pintarAmbientes().catch(() => {})
  }, 5000)
}

async function levantar(a) {
  const { puertos } = await pedir(`/api/ambientes/${a.id}/estorbo`)
  if (puertos.length) {
    const texto = puertos.length === 1 ? `El puerto ${puertos[0]} está ocupado` : `Los puertos ${puertos.join(", ")} están ocupados`
    if (!confirm(`${texto}.\n\nSeguramente quedó una corrida anterior abierta. ¿La cierro y levanto ${a.titulo}?`)) return
    for (const p of puertos) await pedir(`/api/puertos/${p}`, { method: "DELETE" })
  }
  correrPorId(`prender-${a.id}`, `Levantar: ${a.titulo}`)
}

async function apagarAmbiente(a, boton) {
  if (!confirm(`¿Apagar ${a.titulo}? Se cierra lo que esté usando sus puertos${a.apagar ? " y se bajan sus contenedores" : ""}.`)) return
  boton.disabled = true
  boton.textContent = "Apagando…"
  try {
    const r = await pedir(`/api/ambientes/${a.id}/apagar`, { method: "POST", body: "{}" })
    if (!r.ok) alert(r.msg)
  } finally {
    pintarAmbientes()
  }
}

async function liberar(puerto) {
  if (!confirm(`¿Cerrar lo que esté usando el puerto ${puerto}?`)) return
  const r = await pedir(`/api/puertos/${puerto}`, { method: "DELETE" })
  alert(r.msg)
  pintarAmbientes()
}

function correrPorId(id, titulo) {
  const c = comandos.find((x) => x.id === id) ?? { id, titulo, cmd: "", args: [] }
  correr(c)
}


// ── Registros en vivo ──────────────────────────────────────────────────────
let logAbierto = null

async function pintarRegistros() {
  const { contenedores } = await pedir("/api/panel/registros")
  const frag = document.createDocumentFragment()
  if (!contenedores.length) {
    frag.append(el("div", "cargando", "No hay contenedores de Mirai. Levanta un ambiente primero."))
  }
  const grupos = [...new Set(contenedores.map((c) => c.proyecto))]
  for (const g of grupos) {
    const t = el("section", "tarjeta")
    const cab = el("div", "tarjeta-cabeza")
    cab.append(el("h2", null, g), el("p", null, `${contenedores.filter((c) => c.proyecto === g && c.arriba).length} de ${contenedores.filter((c) => c.proyecto === g).length} arriba`))
    t.append(cab)
    for (const c of contenedores.filter((x) => x.proyecto === g)) {
      const fila = el("div", "comando")
      const izq = el("div")
      const n = el("div", "n")
      n.append(punto(c.arriba ? "ok" : "apagado"), " ", c.servicio)
      izq.append(n, el("div", "d", c.detalle || c.imagen), el("div", "cmd", `${c.nombre} · ${c.estado}`))
      const b = el("button", "boton boton--suave", "Ver registros")
      b.disabled = !c.arriba
      b.onclick = () => verRegistros(c)
      fila.append(izq, b)
      t.append(fila)
    }
    frag.append(t)
  }
  $contenido.replaceChildren(frag)
}

async function verRegistros(c) {
  const { id } = await pedir(`/api/registros/${c.nombre}`, { method: "POST", body: "{}" })
  const t = el("section", "tarjeta")
  const cab = el("div", "tarjeta-cabeza")
  cab.append(el("h2", null, `Registros · ${c.servicio}`), el("p", null, c.nombre))
  const acciones = el("div", "acciones")
  const filtro = el("input", "campo")
  filtro.placeholder = "filtrar…"
  const cerrar = el("button", "boton boton--suave", "Cerrar")
  acciones.append(filtro, cerrar)
  cab.append(acciones)
  const salida = el("pre", "salida salida--alta")
  t.append(cab, salida)
  $contenido.replaceChildren(t)

  const todas = []
  const repintar = () => {
    const q = filtro.value.toLowerCase()
    salida.replaceChildren(...todas.filter((l) => !q || l.toLowerCase().includes(q)).slice(-800).map((l) => el("div", null, l)))
    salida.scrollTop = salida.scrollHeight
  }
  filtro.oninput = repintar
  const es = new EventSource(`/sse/registros/${id}?t=${token}`)
  logAbierto = es
  es.addEventListener("historia", (e) => {
    todas.push(...JSON.parse(e.data).map((l) => l.texto))
    repintar()
  })
  es.addEventListener("linea", (e) => {
    todas.push(JSON.parse(e.data).texto)
    repintar()
  })
  cerrar.onclick = () => {
    es.close()
    pintarRegistros()
  }
}

// ── Recursos ───────────────────────────────────────────────────────────────
function medidor(fraccion, etiqueta) {
  const caja = el("div", "medidor")
  const barra = el("div", "medidor-barra")
  const relleno = el("div", `medidor-relleno ${fraccion >= 0.9 ? "alto" : fraccion >= 0.75 ? "medio" : "bajo"}`)
  relleno.style.width = `${Math.min(100, Math.round(fraccion * 100))}%`
  barra.append(relleno)
  caja.append(barra, el("span", "medidor-texto", etiqueta))
  return caja
}

async function pintarRecursos() {
  const { uso, discoDocker, disco } = await pedir("/api/panel/recursos")
  const frag = document.createDocumentFragment()

  if (disco) {
    const t = el("section", "tarjeta")
    const cab = el("div", "tarjeta-cabeza")
    cab.append(el("h2", null, "Disco de este computador"), el("p", null, `${disco.usado} usados de ${disco.total} · ${disco.libre} libres`))
    const filas = el("div", "filas")
    const fila = el("div", "fila")
    filas.append(fila)
    t.append(cab, filas)
    fila.append(el("div", "n", "Uso"), medidor(disco.fraccion, `${Math.round(disco.fraccion * 100)}%`), el("div", "d", disco.fraccion >= 0.75 ? "Ya va apretado." : "Hay espacio de sobra."))
    frag.append(t)
  }

  const t2 = el("section", "tarjeta")
  const cab2 = el("div", "tarjeta-cabeza")
  cab2.append(el("h2", null, "Contenedores"), el("p", null, uso.length ? `${uso.length} corriendo, ordenados por CPU` : "ninguno corriendo"))
  t2.append(cab2)
  const filas = el("div", "filas")
  for (const u of uso) {
    const f = el("div", "fila fila--uso")
    f.append(
      el("div", "n", u.nombre.replace(/^mirai-/, "")),
      medidor(Math.min(1, u.cpu), `${Math.round(u.cpu * 100)}% CPU`),
      medidor(u.memoriaFraccion, `${Math.round(u.memoria)} MB`),
      el("div", "d", `red ${u.red} · disco ${u.disco}`),
    )
    filas.append(f)
  }
  t2.append(filas)
  frag.append(t2)

  if (discoDocker.length) {
    const t3 = el("section", "tarjeta")
    const cab3 = el("div", "tarjeta-cabeza")
    cab3.append(el("h2", null, "Lo que ocupa Docker"), el("p", null, "Lo recuperable se libera con docker system prune"))
    t3.append(cab3)
    const fs = el("div", "filas")
    for (const d of discoDocker) {
      const f = el("div", "fila")
      f.append(el("div", "n", d.titulo), el("div", "v", d.tamano), el("div", "d", `${d.recuperable} se pueden liberar`))
      fs.append(f)
    }
    t3.append(fs)
    frag.append(t3)
  }
  $contenido.replaceChildren(frag)
}

// ── Base de datos ──────────────────────────────────────────────────────────
async function pintarBase() {
  const { base } = await pedir("/api/panel/base")
  const frag = document.createDocumentFragment()

  const cabT = el("section", "tarjeta")
  const cab = el("div", "tarjeta-cabeza")
  const h = el("h2")
  h.append(punto(base.estado.estado), " ", "Base local")
  const izq = el("div")
  izq.append(h)
  cab.append(izq, el("p", "sutil", base.estado.detalle))
  cabT.append(cab)

  // Consulta de solo lectura.
  const form = el("form", "consulta")
  const campo = el("textarea", "campo campo--sql")
  campo.placeholder = "select * from expenses order by created_at desc limit 10"
  campo.rows = 3
  const btn = el("button", "boton", "Consultar")
  btn.type = "submit"
  const nota = el("p", "sutil", "Solo lectura: select, with, explain. La transacción es read only.")
  const accionesSql = el("div", "acciones")
  accionesSql.append(btn)
  form.append(campo, accionesSql, nota)
  const salida = el("div")
  form.onsubmit = async (e) => {
    e.preventDefault()
    btn.disabled = true
    try {
      const r = await pedir("/api/base/consulta", { method: "POST", body: JSON.stringify({ sql: campo.value }) })
      salida.replaceChildren(r.ok ? tablaDatos(r.datos.columnas, r.datos.filas, `${r.datos.filas.length} filas · ${r.datos.ms} ms`) : el("p", "aviso-caja", r.msg))
    } finally {
      btn.disabled = false
    }
  }
  cabT.append(form, salida)
  frag.append(cabT)

  if (base.error) frag.append(el("p", "aviso-caja", base.error))

  const t = el("section", "tarjeta")
  const c2 = el("div", "tarjeta-cabeza")
  c2.append(el("h2", null, "Tablas"), el("p", null, `${base.tablas.length} en el esquema público`))
  t.append(c2)
  const filas = el("div", "filas")
  for (const tb of base.tablas) {
    const f = el("div", "fila fila--accion")
    f.append(el("div", "n", tb.nombre), el("div", "v", `${tb.filas.toLocaleString("es-CO")} filas · ${tb.tamano}`), el("div", "d", tb.comentario ?? (tb.rls ? "Con seguridad por fila (RLS)." : "Sin RLS.")))
    f.onclick = () => verTabla(tb)
    filas.append(f)
  }
  t.append(filas)
  frag.append(t)
  $contenido.replaceChildren(frag)
}

function tablaDatos(columnas, filas, pie) {
  const caja = el("div", "tabla-caja")
  const tabla = el("table", "tabla")
  const thead = el("thead")
  const trh = el("tr")
  for (const c of columnas) trh.append(el("th", null, c))
  thead.append(trh)
  const tbody = el("tbody")
  for (const fila of filas) {
    const tr = el("tr")
    for (const v of fila) tr.append(el("td", null, v === null ? "—" : typeof v === "object" ? JSON.stringify(v) : String(v)))
    tbody.append(tr)
  }
  tabla.append(thead, tbody)
  caja.append(tabla)
  if (pie) caja.append(el("p", "sutil", pie))
  return caja
}

async function verTabla(tb) {
  const { detalle, filas } = await pedir(`/api/base/tabla/${tb.nombre}`)
  const t = el("section", "tarjeta")
  const cab = el("div", "tarjeta-cabeza")
  cab.append(el("h2", null, tb.nombre), el("p", null, `${tb.filas.toLocaleString("es-CO")} filas · ${tb.tamano}${tb.rls ? " · con RLS" : ""}`))
  const volver = el("button", "boton boton--suave", "Volver")
  volver.onclick = () => pintarBase()
  cab.append(volver)
  t.append(cab)
  if (detalle.ok) {
    const d = detalle.datos
    t.append(el("div", "grupo", "Columnas"))
    const fs = el("div", "filas")
    for (const col of d.columnas) {
      const f = el("div", "fila")
      f.append(el("div", "n", col.nombre), el("div", "v", col.tipo), el("div", "d", [col.nulo ? "puede ir vacía" : "obligatoria", col.porDefecto ? `por defecto ${col.porDefecto}` : ""].filter(Boolean).join(" · ")))
      fs.append(f)
    }
    t.append(fs)
    if (d.politicas.length) {
      t.append(el("div", "grupo", "Seguridad por fila (RLS)"))
      const ps = el("div", "filas")
      for (const pol of d.politicas) {
        const f = el("div", "fila")
        f.append(el("div", "n", pol.nombre), el("div", "v", pol.orden), el("div", "d", pol.usando ?? ""))
        ps.append(f)
      }
      t.append(ps)
    }
  }
  if (filas.ok) {
    t.append(el("div", "grupo", "Primeras filas"))
    t.append(tablaDatos(filas.datos.columnas, filas.datos.filas))
  }
  $contenido.replaceChildren(t)
}

// ── Pruebas ────────────────────────────────────────────────────────────────
async function pintarPruebas() {
  const { pruebas } = await pedir("/api/panel/pruebas")
  const frag = document.createDocumentFragment()
  const t = el("section", "tarjeta")
  const cab = el("div", "tarjeta-cabeza")
  cab.append(el("h2", null, "Baterías"), el("p", null, pruebas.ultima ? `La de pantalla corrió por última vez el ${pruebas.ultima}` : "Sin corridas recientes"))
  t.append(cab)
  for (const s of pruebas.suites) {
    const f = el("div", "comando")
    const izq = el("div")
    izq.append(el("div", "n", s.titulo), el("div", "d", s.detalle), el("div", "cmd", `${s.cmd} ${s.args.join(" ")} · ${s.tarda}`))
    const b = el("button", "boton", "Correr")
    b.onclick = () => correrPorId(`prueba-${s.id}`, s.titulo)
    f.append(izq, b)
    t.append(f)
  }
  frag.append(t)

  if (pruebas.capturas.length) {
    const t2 = el("section", "tarjeta")
    const c2 = el("div", "tarjeta-cabeza")
    c2.append(el("h2", null, "Capturas"), el("p", null, `${pruebas.capturas.length} de la última batería`))
    t2.append(c2)
    const rejilla = el("div", "rejilla")
    for (const c of pruebas.capturas) {
      const fig = el("figure", "captura")
      const img = el("img")
      img.loading = "lazy"
      img.src = `/capturas/${c.archivo.split("/").pop()}?t=${token}`
      img.alt = c.nombre
      fig.append(img, el("figcaption", null, c.nombre))
      fig.onclick = () => window.open(img.src, "_blank")
      rejilla.append(fig)
    }
    t2.append(rejilla)
    frag.append(t2)
  }
  $contenido.replaceChildren(frag)
}

// ── Cambios (git) ──────────────────────────────────────────────────────────
async function pintarGit() {
  const { git } = await pedir("/api/panel/git")
  const frag = document.createDocumentFragment()
  const t = el("section", "tarjeta")
  const cab = el("div", "tarjeta-cabeza")
  cab.append(el("h2", null, `Rama ${git.situacion.rama}`), el("p", null, `${git.situacion.sinGuardar} sin guardar · ${git.situacion.sinSubir} sin subir · ${git.situacion.sinBajar} sin bajar`))
  t.append(cab)
  for (const g of git.grupos) {
    t.append(el("div", "grupo", `${g.paquete} — ${g.cambios.length}`))
    const fs = el("div", "filas")
    for (const c of g.cambios) {
      const f = el("div", "fila fila--accion")
      f.append(el("div", "n", c.ruta.split("/").pop()), el("div", "v", c.etiqueta), el("div", "d", c.ruta))
      f.onclick = () => verDiff(c.ruta)
      fs.append(f)
    }
    t.append(fs)
  }
  frag.append(t)

  const t2 = el("section", "tarjeta")
  const c2 = el("div", "tarjeta-cabeza")
  c2.append(el("h2", null, "Últimos commits"))
  t2.append(c2)
  const fs2 = el("div", "filas")
  for (const c of git.commits) {
    const f = el("div", "fila")
    f.append(el("div", "n", c.mensaje), el("div", "v", c.hash), el("div", "d", `${c.autor} · ${c.cuando}`))
    fs2.append(f)
  }
  t2.append(fs2)
  frag.append(t2)
  $contenido.replaceChildren(frag)
}

async function verDiff(ruta) {
  const { lineas } = await pedir(`/api/git/diff?ruta=${encodeURIComponent(ruta)}`)
  const t = el("section", "tarjeta")
  const cab = el("div", "tarjeta-cabeza")
  cab.append(el("h2", null, ruta.split("/").pop()), el("p", null, ruta))
  const volver = el("button", "boton boton--suave", "Volver")
  volver.onclick = () => pintarGit()
  cab.append(volver)
  const pre = el("pre", "salida salida--alta")
  for (const l of lineas) {
    pre.append(el("div", l.startsWith("+") && !l.startsWith("+++") ? "mas" : l.startsWith("-") && !l.startsWith("---") ? "menos" : l.startsWith("@@") ? "trozo" : null, l))
  }
  t.append(cab, pre)
  $contenido.replaceChildren(t)
}

// ── Despliegue ─────────────────────────────────────────────────────────────
async function pintarDespliegue() {
  const { despliegue } = await pedir("/api/panel/despliegue")
  const frag = document.createDocumentFragment()
  if (!despliegue.ok) frag.append(el("p", "aviso-caja", despliegue.msg))
  const t = el("section", "tarjeta")
  const cab = el("div", "tarjeta-cabeza")
  const publicado = despliegue.corridas.find((c) => c.despliegue && c.estado === "ok")
  cab.append(el("h2", null, "Corridas de main"), el("p", null, publicado ? `Lo último publicado: ${publicado.cuando}` : "Sin despliegues exitosos recientes"))
  t.append(cab)
  const fs = el("div", "filas")
  for (const c of despliegue.corridas) {
    const f = el("div", "fila fila--accion")
    const n = el("div", "n")
    n.append(punto(c.estado), " ", c.nombre)
    f.append(n, el("div", "v", c.resultado), el("div", "d", `${c.commit} · ${c.cuando}`))
    f.onclick = () => (c.estado === "error" ? verLogCi(c) : window.open(c.url, "_blank"))
    fs.append(f)
  }
  t.append(fs)
  frag.append(t)
  $contenido.replaceChildren(frag)
}

async function verLogCi(c) {
  const t = el("section", "tarjeta")
  const cab = el("div", "tarjeta-cabeza")
  cab.append(el("h2", null, `Por qué falló · ${c.nombre}`), el("p", null, `${c.commit} · ${c.cuando}`))
  const volver = el("button", "boton boton--suave", "Volver")
  volver.onclick = () => pintarDespliegue()
  cab.append(volver)
  const pre = el("pre", "salida salida--alta")
  pre.textContent = "Pidiéndole el registro a GitHub…"
  t.append(cab, pre)
  $contenido.replaceChildren(t)
  const { lineas } = await pedir(`/api/despliegue/${c.id}/log`)
  pre.replaceChildren(...lineas.map((l) => el("div", /error|failed|✗|×/i.test(l) ? "err" : null, l)))
  pre.scrollTop = pre.scrollHeight
}

// ── Endpoints ──────────────────────────────────────────────────────────────
async function pintarEndpoints() {
  const { endpoints } = await pedir("/api/panel/endpoints")
  const frag = document.createDocumentFragment()
  const buscador = el("input", "campo campo--ancho")
  buscador.placeholder = `Filtrar entre ${endpoints.length} endpoints…`
  const cont = el("div")
  const pintar = () => {
    const q = buscador.value.toLowerCase()
    const vistos = endpoints.filter((e) => !q || `${e.metodo} ${e.ruta} ${e.resumen} ${e.modulo}`.toLowerCase().includes(q))
    cont.replaceChildren()
    for (const m of [...new Set(vistos.map((e) => e.modulo))]) {
      const t = el("section", "tarjeta")
      const cab = el("div", "tarjeta-cabeza")
      cab.append(el("h2", null, m), el("p", null, `${vistos.filter((e) => e.modulo === m).length} endpoints`))
      t.append(cab)
      const fs = el("div", "filas")
      for (const e of vistos.filter((x) => x.modulo === m)) {
        const f = el("div", "fila fila--endpoint")
        const met = el("div", "n")
        // el() con un tercer argumento lo pone como TEXTO: un elemento hay que anexarlo.
        met.append(el("span", `metodo metodo--${e.metodo.toLowerCase()}`, e.metodo))
        f.append(met, el("div", "v", e.ruta), el("div", "d", e.resumen))
        if (!e.escribe) {
          const b = el("button", "boton boton--mini", "Probar")
          b.onclick = () => probarEndpoint(e)
          f.append(b)
        }
        fs.append(f)
      }
      t.append(fs)
      cont.append(t)
    }
  }
  buscador.oninput = pintar
  pintar()
  const barra = el("div", "barra-busqueda")
  barra.append(buscador)
  frag.append(barra, cont)
  $contenido.replaceChildren(frag)
  buscador.focus()
}

async function probarEndpoint(e) {
  const ruta = e.parametros.length
    ? prompt(`Reemplaza los parámetros (${e.parametros.join(", ")}):`, e.ruta)
    : e.ruta
  if (!ruta) return
  const r = await pedir("/api/endpoints/probar", { method: "POST", body: JSON.stringify({ ruta, metodo: "GET" }) })
  alert(`${r.codigo ?? "sin respuesta"} · ${r.ms} ms\n\n${(r.cuerpo ?? "").slice(0, 1200)}`)
}

// ── Buscador global ────────────────────────────────────────────────────────
async function abrirBuscador() {
  const d = document.getElementById("buscador")
  const campo = document.getElementById("buscador-campo")
  const lista = document.getElementById("buscador-lista")
  campo.value = ""
  lista.replaceChildren()
  const { resumen } = await pedir("/api/buscar?q=")
  lista.append(el("p", "sutil", `Busca entre ${resumen.reduce((a, r) => a + r.cuantos, 0)} cosas: ${resumen.map((r) => `${r.cuantos} ${r.tipo.toLowerCase()}`).join(" · ")}`))
  d.showModal()
  campo.focus()
  let t
  campo.oninput = () => {
    clearTimeout(t)
    t = setTimeout(async () => {
      const { resultados } = await pedir(`/api/buscar?q=${encodeURIComponent(campo.value)}`)
      lista.replaceChildren(
        ...(resultados.length
          ? resultados.map((h) => {
              const f = el("div", "hallazgo")
              f.append(el("span", "hallazgo-tipo", h.tipo), el("span", "hallazgo-titulo", h.titulo), el("span", "hallazgo-detalle", h.detalle), el("span", "hallazgo-donde", h.donde ?? ""))
              f.onclick = () => {
                d.close()
                ir(h.panel)
              }
              lista.append(f)
              return f
            })
          : [el("p", "sutil", "Nada con eso.")]),
      )
    }, 120)
  }
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
document.getElementById("buscar").onclick = () => abrirBuscador()
document.getElementById("refrescar").onclick = () => (actual === "salud" ? pintarSalud(true) : ir(actual))

document.addEventListener("keydown", (e) => {
  if ((e.key === "k" && (e.metaKey || e.ctrlKey)) || (e.key === "/" && !e.target.matches("input, textarea"))) {
    e.preventDefault()
    abrirBuscador()
    return
  }
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
