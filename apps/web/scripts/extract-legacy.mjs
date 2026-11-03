// Extrae a lib/data/*.json los datos literales de Mirai 4.0 (legacy/) para la v5.
// Ejecuta el bundle legacy en un sandbox con DOM falso y lee las constantes globales.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import vm from 'node:vm'

const js = readFileSync('../../legacy/dist/app.check.js', 'utf8')
const noop = () => {}
const el = new Proxy(function () {}, { get: (t, k) => (k === Symbol.toPrimitive ? () => '' : el), apply: () => el, construct: () => el, set: () => true })
const store = {}
const ctx = {
  console: { log: noop, warn: noop, error: noop, info: noop },
  window: {}, document: el, navigator: { userAgent: 'node', language: 'es-CO' }, location: { hash: '', search: '', href: 'http://x/', pathname: '/' },
  localStorage: { getItem: k => store[k] ?? null, setItem: (k, v) => (store[k] = String(v)), removeItem: k => delete store[k] },
  sessionStorage: { getItem: () => null, setItem: noop, removeItem: noop },
  setTimeout: () => 0, clearTimeout: noop, setInterval: () => 0, clearInterval: noop, requestAnimationFrame: () => 0,
  addEventListener: noop, removeEventListener: noop, matchMedia: () => ({ matches: false, addEventListener: noop }),
  fetch: () => new Promise(noop), crypto: globalThis.crypto, TextEncoder, TextDecoder, URL, URLSearchParams, Intl, Date, Math, JSON,
  getComputedStyle: () => ({}), innerWidth: 1366, innerHeight: 900, scrollTo: noop, history: { replaceState: noop, pushState: noop },
  CustomEvent: function () {}, Event: function () {}, HTMLElement: function () {}, Image: function () {}, atob, btoa,
}
ctx.window = ctx; ctx.globalThis = ctx; ctx.self = ctx
const names = ['FHELP','MDESC','HELP','FAQ','RELEASES','GUIDES','APP_VER','GEO','GEO_TOP','GEO_ALIAS','GEO_ZONAS','RDOCS','RETOS_T','BADGES','GLV','MISIONES','ISO','ICONS','SISTEMAS','FFREC','INVT','PUC_A','PUC_P','PARENTS','PARENT_IC','BTIP','AJTABS','TOUR','MENU']
const tail = '\n;globalThis.__out = {' + names.map(n => `${n}: (typeof ${n} !== 'undefined' ? ${n} : undefined)`).join(',') + '};'
const code = js.slice(0, js.lastIndexOf('if(CONT_Q)contBoot()')) + tail
const extra = []
let out = {}
for (let intento = 0; intento < 40; intento++) {
  const c = { ...ctx }; c.window = c; c.globalThis = c; c.self = c
  for (const n of extra) c[n] = el   // globales del navegador que no existen en Node: se simulan
  try { vm.runInNewContext(code, c, { timeout: 20000 }); out = c.__out || {}; break } catch (e) {
    const m = /^(\w+) is not defined/.exec(e.message)
    if (!m) { console.error('Aviso al ejecutar legacy:', e.message); break }
    extra.push(m[1])
  }
}
mkdirSync('lib/data', { recursive: true })
for (const [k, v] of Object.entries(out)) {
  if (v === undefined || typeof v === 'function') { console.log('—', k, typeof v); continue }
  writeFileSync(`lib/data/legacy-${k.toLowerCase()}.json`, JSON.stringify(v, null, 1))
  console.log('✓', k, Array.isArray(v) ? v.length : Object.keys(v).length)
}
