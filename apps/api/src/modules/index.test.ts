import { readdirSync } from "node:fs"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import * as contracts from "@mirai/contracts"
import { API_MODULES, apiModules, realtimeModules } from "./index"

describe("modules/index.ts", () => {
  it("hay un módulo de Nest por cada módulo de packages/contracts (31) más book-tables", () => {
    const metas = (Object.values(contracts) as unknown[])
      .filter((v): v is { meta: { id: string; owner: string } } => typeof v === "object" && v !== null && "meta" in v && typeof v.meta === "object" && v.meta !== null && "owner" in v.meta)
      .map((v) => v.meta.id)
      .sort()
    expect(metas).toHaveLength(31)
    const ids = API_MODULES.map((m) => m.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids.filter((i) => i !== "book-tables").sort()).toEqual(metas)
  })

  it("cada módulo vive en su carpeta y MODE=api no carga el gateway", () => {
    const dirs = readdirSync(join(__dirname), { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name).sort()
    expect(dirs).toEqual(API_MODULES.map((m) => m.id).sort())
    expect(apiModules()).toHaveLength(API_MODULES.length - 1)
    expect(realtimeModules().map((m) => m.name)).toEqual(["HealthModule", "RealtimeModule"])
  })
})
