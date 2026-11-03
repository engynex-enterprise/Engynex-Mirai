import { defineConfig } from "vitest/config"
import { miraiTest } from "@mirai/config/vitest"

// Pruebas del dominio, incluida la paridad con la v4 (src/__tests__/legacy.ts carga legacy/dist/app.check.js de la raíz).
export default defineConfig({ test: miraiTest() })
