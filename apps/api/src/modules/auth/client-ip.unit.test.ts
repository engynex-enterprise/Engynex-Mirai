import { describe, expect, it } from "vitest"
import { CLIENT_IP_HEADER, clientIp, toWebRequest } from "./auth.routes"

describe("IP real del cliente para los límites de intentos del login", () => {
  it("detrás del balanceador (1 salto): la IP que vio el balanceador, no la suya", () => {
    expect(clientIp("190.24.10.5, 34.120.1.1", 1)).toBe("190.24.10.5")
  })
  it("una IP inventada por el cliente a la izquierda no sirve para saltarse el límite", () => {
    expect(clientIp("1.2.3.4, 190.24.10.5, 34.120.1.1", 1)).toBe("190.24.10.5")
  })
  it("con dos proxies de confianza cuenta dos desde la derecha", () => {
    expect(clientIp("9.9.9.9, 190.24.10.5, 10.0.0.2, 34.120.1.1", 2)).toBe("190.24.10.5")
  })
  it("sin x-forwarded-for (local) usa la IP del socket", () => {
    expect(clientIp(undefined, 1, "127.0.0.1")).toBe("127.0.0.1")
  })
  it("el cliente no puede mandar el encabezado propio: la API lo reemplaza", () => {
    const req = toWebRequest({ url: "/api/auth/sign-in/email", method: "GET", headers: { [CLIENT_IP_HEADER]: "6.6.6.6", "x-forwarded-for": "190.24.10.5, 34.120.1.1" } }, "https://mirai.engynex.com", 1)
    expect(req.headers.get(CLIENT_IP_HEADER)).toBe("190.24.10.5")
  })
})
