import { defineConfig } from "vitest/config"
import { miraiTest } from "@mirai/config/vitest"

export default defineConfig({ test: miraiTest() })
