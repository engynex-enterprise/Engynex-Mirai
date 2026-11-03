// ESLint (flat) para los paquetes sin Next (packages/*, apps/api). apps/web usa eslint-config-next.
// Mismas reglas de TypeScript que eslint-config-next/typescript (typescript-eslint recomendado), para que el código que
// salió de apps/web (lib/domain…) se revise igual que antes.
import globals from "globals"
import tseslint from "typescript-eslint"

// §3.0 regla 1 (v7, "la app no conoce la nube"): los SDK de nube solo se importan en apps/api/src/adapters/<nube>/**, y
// cada carpeta solo el de su nube (gcp → @google-cloud/*, aws → @aws-sdk/*, azure → @azure/*). Cubre import estático,
// `export … from`, `import()` dinámico y `require()`. El resto del código usa los puertos (QueuePort, ObjectStore…).
const CLOUD_SDKS = { gcp: "@google-cloud", aws: "@aws-sdk", azure: "@azure" }
const CLOUD_MSG =
  "Los SDK de nube (@google-cloud/*, @aws-sdk/*, @azure/*) solo se importan en apps/api/src/adapters/<nube>/** (§3.0 regla 1: la app no conoce la nube). Usa el puerto (QueuePort, ObjectStore, SecretResolver…) y su adaptador."

/** Reglas que prohíben importar los paquetes con esos prefijos. */
function blockSdks(prefixes, message) {
  // esquery no admite "/" dentro de una expresión regular: \u002F es la barra.
  const re = `^(${prefixes.join("|")})\\u002F`
  return {
    "no-restricted-imports": ["error", { patterns: [{ group: prefixes.map((p) => `${p}/*`), message }] }],
    "no-restricted-syntax": [
      "error",
      { selector: `ImportExpression[source.value=/${re}/]`, message },
      { selector: `CallExpression[callee.name='require'][arguments.0.value=/${re}/]`, message },
    ],
  }
}

/** Configuración de la regla de los SDK de nube (exportada para usarla también en apps/web). */
export function cloudSdkRules() {
  const all = Object.values(CLOUD_SDKS)
  return [
    { rules: blockSdks(all, CLOUD_MSG) },
    ...Object.entries(CLOUD_SDKS).map(([cloud, prefix]) => ({
      // Ruta absoluta: solo la carpeta de adaptadores de apps/api (no un src/adapters de otro paquete).
      files: [(path) => new RegExp(`[\\\\/]apps[\\\\/]api[\\\\/]src[\\\\/]adapters[\\\\/]${cloud}[\\\\/]`).test(path)],
      rules: blockSdks(
        all.filter((p) => p !== prefix),
        `En apps/api/src/adapters/${cloud} solo se importa ${prefix}/* (cada nube en su carpeta, §3.0 regla 1).`,
      ),
    })),
  ]
}

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
    ...cloudSdkRules(),
  )
}

export default miraiEslint()
