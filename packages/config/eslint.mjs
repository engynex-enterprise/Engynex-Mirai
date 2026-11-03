// ESLint (flat) para los paquetes sin Next (packages/*, apps/api). apps/web usa eslint-config-next.
// Mismas reglas de TypeScript que eslint-config-next/typescript (typescript-eslint recomendado), para que el código que
// salió de apps/web (lib/domain…) se revise igual que antes.
import globals from "globals"
import tseslint from "typescript-eslint"

/** @param {{ ignores?: string[] }} [opts] */
export function miraiEslint(opts = {}) {
  return tseslint.config(
    { ignores: ["dist/**", "coverage/**", ".turbo/**", "node_modules/**", ...(opts.ignores ?? [])] },
    ...tseslint.configs.recommended,
    {
      languageOptions: { globals: { ...globals.node }, ecmaVersion: 2023, sourceType: "module" },
      rules: {
        // Igual que en apps/web (eslint-config-next/typescript): `_` para lo que no se usa a propósito.
        "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_", caughtErrorsIgnorePattern: "^_" }],
      },
    },
  )
}

export default miraiEslint()
