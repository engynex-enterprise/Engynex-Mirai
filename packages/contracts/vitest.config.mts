import { defineConfig } from "vitest/config"
import { miraiTest } from "@mirai/config/vitest"

// Pruebas de los contratos (políticas, tablas en vivo y esquemas comunes).
export default defineConfig({ test: miraiTest() })
