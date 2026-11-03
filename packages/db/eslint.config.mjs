import { miraiEslint } from "@mirai/config/eslint"

// database.types.ts lo genera la CLI de Supabase (pnpm db:types).
export default miraiEslint({ ignores: ["src/database.types.ts"] })
