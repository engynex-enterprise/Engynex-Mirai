import swc from "unplugin-swc"
import { defineConfig } from "vitest/config"
import { miraiTest } from "@mirai/config/vitest"

// NestJS necesita `emitDecoratorMetadata` (inyección por tipo del constructor). El transformador de Vite (oxc) no lo
// emite igual que TypeScript, así que las pruebas compilan con swc (unplugin-swc), igual que scripts/build.mjs.
export default defineConfig({
  plugins: [
    swc.vite({
      tsconfigFile: false,
      jsc: {
        parser: { syntax: "typescript", decorators: true },
        transform: { legacyDecorator: true, decoratorMetadata: true, useDefineForClassFields: false },
        target: "es2022",
      },
    }),
  ],
  test: miraiTest({ include: ["src/**/*.test.ts", "test/**/*.test.{ts,tsx}"], setupFiles: ["test/setup/env.ts"] }),
})
