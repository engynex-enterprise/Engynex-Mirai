// Cancelación del chat en streaming con una conexión real (inject no tiene socket): si la persona cierra la pestaña o
// toca "Detener", el turno recibe la señal (como req.signal en app/api/chat/route.ts) y guarda lo que alcanzó a llegar.
// En su propio archivo: una app escuchando en un puerto local, aparte de la de f2f.int.test.ts.
import { request } from "node:http"
import { describe, expect, it } from "vitest"
import { createF2fApp } from "./f2f/app"
import { B_GRATIS, USERS } from "./setup/fixtures"
import { userToken } from "./setup/tokens"

const auth = async (role: keyof typeof USERS) => ({ authorization: `Bearer ${await userToken(USERS[role])}` })

describe("chat en streaming: cancelación", () => {
  it("si la persona cierra la conexión, el turno recibe la cancelación (como req.signal en /api/chat)", async () => {
    const own = await createF2fApp()
    try {
      own.chat.hold = true
      await own.app.listen(0, "127.0.0.1")
      const { port } = own.app.getHttpServer().address() as { port: number }
      const headers = { ...(await auth("viewer")), "content-type": "application/json" }
      const first = await new Promise<string>((ok, ko) => {
        const r = request({ host: "127.0.0.1", port, method: "POST", path: `/v1/books/${B_GRATIS}/chat/messages`, headers }, (res) => {
          res.once("data", (chunk: Buffer) => { ok(chunk.toString()); r.destroy() })
        })
        r.on("error", () => {})
        r.once("error", ko)
        r.end(JSON.stringify({ text: "hola" }))
      })
      expect(JSON.parse(first.split("\n")[0])).toMatchObject({ t: "thread" })
      for (let i = 0; i < 100 && !own.chat.aborted; i++) await new Promise((ok) => setTimeout(ok, 20))
      expect(own.chat.aborted).toBe(true)
    } finally {
      await own.close()
    }
  })

})
