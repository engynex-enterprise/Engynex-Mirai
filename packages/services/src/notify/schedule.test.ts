import { describe, expect, it } from "vitest"
import { horarioActivo, LATIDO_HORAS, resumenKey, tareasDiarias, tocaResumen } from "./schedule"

const base = { frecuencia: "diario", hora: 7, hoy: "2026-11-02", h: 7, daily: false, horario: true }

describe("¿cuándo sale el resumen?", () => {
  it("con cron horario: a la hora elegida, no antes", () => {
    expect(tocaResumen({ ...base, h: 6 })).toBe(false)
    expect(tocaResumen({ ...base, h: 7 })).toBe(true)
    expect(tocaResumen({ ...base, h: 15 })).toBe(true) // si a las 7 no se pudo, sale en la próxima pasada (la clave del día evita repetir)
  })
  it("la pasada diaria de Vercel (6 a. m.) con cron horario vivo respeta la hora", () => {
    expect(tocaResumen({ ...base, h: 6, daily: true })).toBe(false)
    expect(tocaResumen({ ...base, hora: 5, h: 6, daily: true })).toBe(true)
  })
  it("sin cron horario la pasada diaria envía a todos (como antes)", () => {
    expect(tocaResumen({ ...base, hora: 20, h: 6, daily: true, horario: false })).toBe(true)
  })
  it("semanal solo los lunes y 'nunca' nunca", () => {
    expect(tocaResumen({ ...base, frecuencia: "semanal", hoy: "2026-11-02" })).toBe(true) // lunes
    expect(tocaResumen({ ...base, frecuencia: "semanal", hoy: "2026-11-03" })).toBe(false)
    expect(tocaResumen({ ...base, frecuencia: "nunca" })).toBe(false)
  })
})

describe("latido del cron horario", () => {
  const now = new Date("2026-11-02T22:10:00Z")
  it("vivo si la última pasada horaria fue hace menos de 3 horas", () => {
    expect(horarioActivo({ cronHorario: true, visto: "2026-11-02T21:05:00Z", now })).toBe(true)
    expect(horarioActivo({ cronHorario: true, visto: new Date(now.getTime() - LATIDO_HORAS * 3_600_000 - 1).toISOString(), now })).toBe(false)
  })
  it("apagado en la consola o sin ninguna pasada: no", () => {
    expect(horarioActivo({ cronHorario: false, visto: "2026-11-02T21:05:00Z", now })).toBe(false)
    expect(horarioActivo({ cronHorario: true, visto: null, now })).toBe(false)
  })
})

describe("tareas de una vez al día", () => {
  it("con cron horario: solo la pasada horaria de esa hora (la diaria de Vercel no las repite)", () => {
    expect(tareasDiarias({ daily: false, horario: true, h: 6 })).toBe(true)
    expect(tareasDiarias({ daily: true, horario: true, h: 6 })).toBe(false)
    expect(tareasDiarias({ daily: false, horario: true, h: 7 })).toBe(false)
    expect(tareasDiarias({ daily: false, horario: true, h: 9, hora: 9 })).toBe(true)
  })
  it("sin cron horario: la pasada diaria", () => {
    expect(tareasDiarias({ daily: true, horario: false, h: 6 })).toBe(true)
    expect(tareasDiarias({ daily: true, horario: false, h: 6, hora: 9 })).toBe(true)
  })
})

it("clave del resumen: persona, libro, canal y día", () => {
  expect(resumenKey("u1", "b1", "email", "2026-11-02")).toBe("resumen:u1:b1:email:2026-11-02")
})
