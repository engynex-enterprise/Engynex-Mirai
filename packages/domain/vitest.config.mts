import { defineConfig } from "vitest/config"
import { miraiTest } from "@mirai/config/vitest"

// Pruebas del dominio, incluida la paridad con la v4 (src/__tests__/legacy.ts carga legacy/dist/app.check.js de la raíz).
// El bundle se compila una sola vez antes de los procesos de prueba (legacy-setup.ts): compilarlo desde cada archivo a
// la vez dejaba a alguno leyéndolo a medio escribir en el CI.
export default defineConfig({ test: { ...miraiTest(), globalSetup: ["./src/__tests__/legacy-setup.ts"] } })
