import { defineConfig } from "vitest/config"
import { miraiTest } from "@mirai/config/vitest"

// Pruebas del cifrado (incluida la compatibilidad con valores cifrados por la v5).
export default defineConfig({ test: miraiTest() })
