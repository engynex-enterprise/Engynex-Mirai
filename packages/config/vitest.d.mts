import type { UserConfig } from "vitest/config"

/** Preset de Vitest de Mirai (TZ America/Bogota, entorno node, *.test.ts, 30 s). */
export declare function miraiTest(test?: UserConfig["test"]): UserConfig["test"]
