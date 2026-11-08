import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { __resetSoundForTests, playSound, setSoundEnabled, SOUND_GAP_MS, SOUND_NOTES, soundEnabled, unlockSoundOnGesture } from "./sound"

// Entorno node: se simulan window, localStorage y un AudioContext que cuenta osciladores.
let started = 0
let state: "suspended" | "running" = "suspended"
class FakeAC {
  currentTime = 0
  destination = {}
  get state() { return state }
  resume() { state = "running"; return Promise.resolve() }
  createGain() { return { gain: { value: 0, setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect: (x: unknown) => x } }
  createOscillator() { return { type: "", frequency: { value: 0 }, connect: (x: unknown) => x, start: () => { started++ }, stop() {} } }
}
const listeners: Record<string, (() => void)[]> = {}
let now = 0

beforeEach(() => {
  started = 0
  state = "suspended"
  now = 10_000
  const store = new Map<string, string>()
  for (const k of Object.keys(listeners)) delete listeners[k]
  vi.stubGlobal("localStorage", { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) })
  vi.stubGlobal("performance", { now: () => now })
  vi.stubGlobal("window", {
    AudioContext: FakeAC,
    addEventListener: (t: string, f: () => void) => { (listeners[t] ??= []).push(f) },
    removeEventListener: (t: string, f: () => void) => { listeners[t] = (listeners[t] ?? []).filter((x) => x !== f) },
  })
  __resetSoundForTests()
})
afterEach(() => vi.unstubAllGlobals())

const tocar = async () => { listeners.pointerdown?.[0]?.(); await Promise.resolve(); await Promise.resolve() }

describe("sonido de los avisos", () => {
  it("no suena antes del primer toque (regla del navegador) y sí después", async () => {
    unlockSoundOnGesture()
    expect(playSound("success")).toBe(false)
    await tocar()
    expect(playSound("success")).toBe(true)
    expect(started).toBe(SOUND_NOTES.success.length)
  })

  it("respeta el interruptor de Ajustes (prendido por defecto)", async () => {
    unlockSoundOnGesture()
    await tocar()
    expect(soundEnabled()).toBe(true)
    setSoundEnabled(false)
    expect(playSound("bell")).toBe(false)
    expect(playSound("bell", { force: true })).toBe(true) // el botón "Probar" suena igual
    setSoundEnabled(true)
    now += SOUND_GAP_MS
    expect(playSound("bell")).toBe(true)
  })

  it("varios avisos seguidos no se atropellan", async () => {
    unlockSoundOnGesture()
    await tocar()
    expect(playSound("warning")).toBe(true)
    now += 100
    expect(playSound("warning")).toBe(false)
    now += SOUND_GAP_MS
    expect(playSound("error")).toBe(true)
  })

  it("sin Web Audio no falla", () => {
    vi.stubGlobal("window", { addEventListener() {}, removeEventListener() {} })
    __resetSoundForTests()
    expect(playSound("info", { force: true })).toBe(false)
  })
})
