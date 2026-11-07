import { describe, expect, it } from "vitest"
import { skipToken, type UseQueryResult } from "@tanstack/react-query"
import { hideUntilHydrated, serverLikeResult } from "./query"

const refetch = (() => Promise.resolve()) as unknown as UseQueryResult["refetch"]
const cached = { status: "success", data: [1, 2], refetch, promise: Promise.resolve([1, 2]) } as unknown as UseQueryResult<number[]>

describe("useQuery seguro para la hidratación", () => {
  it("mientras hidrata esconde lo que ya trae la caché (el servidor no lo tenía)", () => {
    expect(hideUntilHydrated(false, "success", {})).toBe(true)
    expect(hideUntilHydrated(false, "error", {})).toBe(true)
  })
  it("no cambia nada si no hay datos, ya hidrató o el servidor también los tenía (initialData)", () => {
    expect(hideUntilHydrated(false, "pending", {})).toBe(false)
    expect(hideUntilHydrated(true, "success", {})).toBe(false)
    expect(hideUntilHydrated(false, "success", { initialData: [] })).toBe(false)
  })
  it("devuelve lo mismo que el servidor: pendiente y cargando si la consulta está activa", () => {
    const r = serverLikeResult(cached, {})
    expect(r.data).toBeUndefined()
    expect(r.isPending).toBe(true)
    expect(r.isLoading).toBe(true)
    expect(r.status).toBe("pending")
    expect(r.refetch).toBe(refetch)
  })
  it("una consulta apagada (enabled: false o skipToken) queda pendiente pero sin cargar", () => {
    expect(serverLikeResult(cached, { enabled: false }).isLoading).toBe(false)
    expect(serverLikeResult(cached, { queryFn: skipToken }).fetchStatus).toBe("idle")
  })
})
