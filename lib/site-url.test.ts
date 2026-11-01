import { afterEach, describe, expect, it, vi } from "vitest"
import { siteUrl } from "./site-url"

describe("siteUrl", () => {
  afterEach(() => vi.unstubAllEnvs())
  const set = (site?: string, vercel?: string) => {
    vi.stubEnv("NEXT_PUBLIC_SITE_URL", site ?? "")
    vi.stubEnv("VERCEL_PROJECT_PRODUCTION_URL", vercel ?? "")
    vi.stubEnv("NEXT_PUBLIC_VERCEL_PROJECT_PRODUCTION_URL", "")
  }
  it("usa NEXT_PUBLIC_SITE_URL sin barra final", () => { set("https://engynex-mirai.vercel.app/"); expect(siteUrl()).toBe("https://engynex-mirai.vercel.app") })
  it("sin NEXT_PUBLIC_SITE_URL usa el dominio de producción de Vercel", () => { set("", "engynex-mirai.vercel.app"); expect(siteUrl()).toBe("https://engynex-mirai.vercel.app") })
  it("en local cae a localhost", () => { set(); expect(siteUrl()).toBe("http://localhost:3000") })
})
