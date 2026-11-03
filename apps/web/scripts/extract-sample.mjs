// Guarda sample() de la v4 (familia Navarro) en lib/data/sample-v4.json con su fecha de referencia.
// El importador corre todas las fechas para que el ejemplo quede "al día" al cargarlo.
import { readFileSync, writeFileSync } from "node:fs"
import vm from "node:vm"

const js = readFileSync("../../legacy/dist/app.check.js", "utf8")
const code = js.slice(0, js.lastIndexOf("if(CONT_Q)contBoot()")) + "\n;globalThis.__s = sample();"
const el = new Proxy(function () {}, { get: (t, k) => (k === Symbol.toPrimitive ? () => "" : el), apply: () => el, construct: () => el, set: () => true })
const noop = () => {}
const base = { console: { log: noop, warn: noop, error: noop }, document: el, navigator: { userAgent: "node" }, location: { hash: "", search: "", href: "http://x/" },
  localStorage: { getItem: () => null, setItem: noop, removeItem: noop }, setTimeout: () => 0, clearTimeout: noop, setInterval: () => 0, clearInterval: noop,
  addEventListener: noop, matchMedia: () => ({ matches: false, addEventListener: noop }), fetch: () => new Promise(noop), crypto: globalThis.crypto,
  TextEncoder, TextDecoder, URL, URLSearchParams, Intl, Date, Math, JSON, innerWidth: 1366, history: { replaceState: noop } }
const extra = []
for (let i = 0; i < 40; i++) {
  const c = { ...base }; c.window = c; c.globalThis = c; c.self = c
  for (const n of extra) c[n] = el
  try { vm.runInNewContext(code, c, { timeout: 20000 }); writeFileSync("lib/data/sample-v4.json", JSON.stringify({ ref: new Date().toISOString().slice(0, 10), S: c.__s })); console.log("ok", Object.keys(c.__s).length, "colecciones"); break }
  catch (e) { const m = /^(\w+) is not defined/.exec(e.message); if (!m) { console.error(e.message); break } extra.push(m[1]) }
}
