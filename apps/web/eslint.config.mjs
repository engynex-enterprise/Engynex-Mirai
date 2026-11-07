import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // Error React #418: los datos de la caché no se pintan mientras el componente hidrata (lib/query.ts).
    ignores: ["lib/query.ts", "features/book/use-book-data.ts"],
    rules: {
      "no-restricted-imports": ["error", {
        paths: [{
          name: "@tanstack/react-query",
          importNames: ["useQuery", "useQueries", "useSuspenseQuery"],
          message: "Usa useQuery de \"@/lib/query\" (seguro para la hidratación). Si necesitas otro, aplica la misma regla que lib/query.ts.",
        }],
      }],
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    ".next-local/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    "legacy/**",
    "lib/supabase/database.types.ts",
    "tests/.out/**",
  ]),
]);

export default eslintConfig;
