// Carga (criterio de F2-G): 500 conexiones en una instancia, todas en el mismo libro, y un cambio que llega a todas.
// En memoria y en un puerto local; mide el reparto, no la red de Cloud Run.
import { afterAll, beforeAll, describe, expect, it } from "vitest"
import { LIVE_NOTIFY_CHANNEL } from "@mirai/contracts/modules/realtime"
import { PgLiveListener } from "../../src/modules/realtime/pg-live.listener"
import { B_GRATIS, USERS } from "../setup/fixtures"
import { userToken } from "../setup/tokens"
import { connect, connected, createRealtimeApp, type RtTestApp, type TestSocket } from "./helpers"

const N = 500
let t: RtTestApp
const sockets: TestSocket[] = []

beforeAll(async () => {
  t = await createRealtimeApp({ rt: { eventsPer10s: 1000 } })
})
afterAll(async () => {
  for (const s of sockets) s.close()
  await t?.close()
})

describe("carga", () => {
  it(`${N} conexiones entran al libro y reciben un cambio en menos de 1 s`, { timeout: 60_000 }, async () => {
    const roles = ["owner", "admin", "editor", "registra", "viewer"] as const
    const tokens = await Promise.all(roles.map((r) => userToken(USERS[r])))
    for (let i = 0; i < N; i += 50) {
      const batch = Array.from({ length: Math.min(50, N - i) }, (_, k) => connect(t.url, tokens[(i + k) % roles.length]))
      sockets.push(...batch)
      const res = await Promise.all(batch.map(connected))
      expect(res.every((r) => r.ok)).toBe(true)
      const acks = await Promise.all(batch.map((s) => s.emitWithAck("join:book", { bookId: B_GRATIS })))
      expect(acks.every((a) => a.ok)).toBe(true)
    }
    let got = 0
    const all = new Promise<void>((res) => {
      for (const s of sockets) s.once("change", () => ++got === N && res())
    })
    const t0 = performance.now()
    t.app.get(PgLiveListener).handle({ channel: LIVE_NOTIFY_CHANNEL, payload: JSON.stringify({ t: "expenses", op: "INSERT", id: "x", b: B_GRATIS }) })
    await all
    const ms = performance.now() - t0
    expect(got).toBe(N)
    expect(ms).toBeLessThan(1000)
  })
})
