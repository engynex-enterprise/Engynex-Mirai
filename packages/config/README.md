# @mirai/config

Configuración compartida del monorepo (F2-A-1, `docs/arquitectura/v6-separacion-front-back.md`).

| Archivo | Uso |
|---|---|
| `tsconfig.base.json` | Base estricta (ES2022, `moduleResolution: bundler`). `apps/web/tsconfig.json` la extiende. |
| `tsconfig.library.json` | Para `packages/*` y `apps/api` (tipos de Node). |
| `eslint.mjs` | ESLint flat con typescript-eslint para paquetes sin Next (`miraiEslint()`). La web sigue con `eslint-config-next`. |
| `prettier.mjs` | Estilo de referencia (sin punto y coma, comillas dobles, 160 columnas, plugin de Tailwind). La raíz lo usa (`"prettier"` en `package.json`). |
| `vitest.mjs` | `miraiTest()`: TZ `America/Bogota`, entorno node, `*.test.ts`, 30 s por prueba. |
