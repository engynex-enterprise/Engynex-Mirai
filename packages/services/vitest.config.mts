import { defineConfig } from "vitest/config"
import { miraiTest } from "@mirai/config/vitest"

// Pruebas de avisos, WhatsApp, Google Calendar y el tick con dobles: sin base ni envíos reales.
export default defineConfig({ test: miraiTest() })
