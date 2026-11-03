import { defineConfig } from "vitest/config"
import { miraiTest } from "@mirai/config/vitest"

// Pruebas de la IA y el chat con dobles: modelo simulado (MockLanguageModelV4 del AI SDK), base en memoria y
// runtime de @mirai/services falso. Nunca llaman a un proveedor real ni gastan créditos.
export default defineConfig({ test: miraiTest() })
