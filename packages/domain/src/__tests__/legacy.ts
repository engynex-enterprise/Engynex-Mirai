// Carga el bundle de Mirai 4.0 (legacy/dist/app.check.js) en un sandbox de node:vm con un DOM falso
/* eslint-disable @typescript-eslint/no-explicit-any -- el sandbox de la v4 es JavaScript sin tipos */
// y una fecha "hoy" fija, para comparar la lógica de la v5 contra la v4 en las pruebas.
// Técnica tomada de scripts/extract-legacy.mjs.
import { existsSync, readFileSync } from "node:fs"
import { execSync } from "node:child_process"
import path from "node:path"
import vm from "node:vm"

const ROOT = path.resolve(__dirname, "../../../..")
const BUNDLE = path.join(ROOT, "legacy/dist/app.check.js")

let code: string | null = null
function bundle(): string {
  if (code) return code
  if (!existsSync(BUNDLE)) execSync("python3 build.py", { cwd: path.join(ROOT, "legacy"), stdio: "ignore" })
  const js = readFileSync(BUNDLE, "utf8")
  // Se corta antes del arranque (normalBoot) y se expone un evaluador con acceso al ámbito léxico global
  // (las funciones y `let`/`const` de nivel superior del bundle).
  code =
    js.slice(0, js.lastIndexOf("if(CONT_Q)contBoot()")) +
    "\n;globalThis.__ev=function(__src){return eval(__src)};" +
    "globalThis.__set=function(__k,__v){eval(__k+'=__v')};"
  return code
}

export interface Legacy {
  /** Evalúa una expresión dentro del sandbox de la v4. */
  ev<T = any>(src: string): T
  /** Asigna una variable global de la v4 (p. ej. `S`). */
  set(name: string, value: unknown): void
  /** Llama una función global de la v4 con argumentos. */
  call<T = any>(fn: string, ...args: unknown[]): T
  /** Convierte un valor del sandbox a JSON plano (las fechas pasan a 'YYYY-MM-DD'). */
  plain<T = any>(v: unknown): T
  /** Fecha "hoy" fija de este sandbox. */
  today: string
}

const cache = new Map<string, Legacy>()

/** Crea (o reutiliza) un sandbox v4 donde `new Date()` devuelve `today` a las 10:00 locales. */
export function loadLegacy(today: string): Legacy {
  const hit = cache.get(today)
  if (hit) return hit
  const [y, m, d] = today.split("-").map(Number)
  const FIXED = new Date(y, m - 1, d, 10, 0, 0).getTime()
  const RealDate = Date
  class FakeDate extends RealDate {
    constructor(...a: any[]) {
      if (a.length === 0) super(FIXED)
      else super(...(a as [any]))
    }
    static now() {
      return FIXED
    }
  }
  const noop = () => {}
  const el: any = new Proxy(function () {}, {
    get: (_t, k) => (k === Symbol.toPrimitive ? () => "" : el),
    apply: () => el,
    construct: () => el,
    set: () => true,
  })
  const store: Record<string, string> = {}
  const ctx: any = {
    console: { log: noop, warn: noop, error: noop, info: noop },
    document: el,
    navigator: { userAgent: "node", language: "es-CO" },
    location: { hash: "", search: "", href: "http://x/", pathname: "/" },
    localStorage: { getItem: (k: string) => store[k] ?? null, setItem: (k: string, v: string) => (store[k] = String(v)), removeItem: (k: string) => delete store[k] },
    sessionStorage: { getItem: () => null, setItem: noop, removeItem: noop },
    setTimeout: () => 0, clearTimeout: noop, setInterval: () => 0, clearInterval: noop, requestAnimationFrame: () => 0,
    addEventListener: noop, removeEventListener: noop, matchMedia: () => ({ matches: false, addEventListener: noop }),
    fetch: () => new Promise(noop), crypto: globalThis.crypto, TextEncoder, TextDecoder, URL, URLSearchParams,
    Intl, Date: FakeDate, Math, JSON,
    getComputedStyle: () => ({}), innerWidth: 1366, innerHeight: 900, scrollTo: noop, history: { replaceState: noop, pushState: noop },
    CustomEvent: function () {}, Event: function () {}, HTMLElement: function () {}, Image: function () {}, atob, btoa,
  }
  const src = bundle()
  const extra: string[] = []
  let c: any = null
  for (let intento = 0; intento < 40; intento++) {
    c = { ...ctx }
    c.window = c
    c.globalThis = c
    c.self = c
    for (const n of extra) c[n] = el
    try {
      vm.createContext(c)
      vm.runInContext(src, c, { timeout: 20000 })
      break
    } catch (e: any) {
      const mm = /^(\w+) is not defined/.exec(e.message)
      if (!mm) throw e
      extra.push(mm[1])
    }
  }
  const ev = (s: string) => c.__ev(s)
  // Conversión a JSON plano dentro del sandbox (las fechas del sandbox son de otro "realm").
  ev(`globalThis.__plain=function(v){return JSON.parse(JSON.stringify(v,function(k,x){const o=this[k];return o instanceof Date?iso(o):x}))}`)
  const L: Legacy = {
    ev,
    set: (name, value) => c.__set(name, value),
    call: (fn, ...args) => ev(fn)(...args),
    plain: (v) => (v === undefined ? undefined : c.__plain(v)),
    today,
  }
  cache.set(today, L)
  return L
}
