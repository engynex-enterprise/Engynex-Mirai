import { describe, expect, it } from "vitest"
import { dropBlankEnv } from "./blank-env"

describe("dropBlankEnv", () => {
  it("quita las variables vacías o con solo espacios y deja las demás", () => {
    const env: NodeJS.ProcessEnv = { TURNSTILE_SECRET_KEY: "", VAPID_PUBLIC_KEY: "  ", PORT: "8080", CRON_SECRET: "x".repeat(20) }
    expect(dropBlankEnv(env).sort()).toEqual(["TURNSTILE_SECRET_KEY", "VAPID_PUBLIC_KEY"])
    expect(env).toEqual({ PORT: "8080", CRON_SECRET: "x".repeat(20) })
  })
})
