# api — Mirai API (NestJS, fase 2)

Esqueleto de F2-A. El diseño completo está en `docs/arquitectura/v6-separacion-front-back.md` (§2 y §6).

- **Hoy:** `package.json`, `tsconfig.json`, Vitest y la prueba previa **F2-A-6** (`test/spike/ts-rest-zod4.test.ts`):
  contrato ts-rest con esquemas zod 4, servido por NestJS 11 + Fastify (`@ts-rest/nest`) y consumido con el cliente de
  ts-rest y TanStack Query v5. Resultado y decisión D2 en el documento (§7.2).
- **F2-B** crea `src/main.ts` (Fastify, `rawBody`, CORS, `MODE=api|realtime`), `src/app.module.ts`, `src/otel.ts`,
  `src/core/**` (config, auth, context, db, errors, logging, rate-limit, idempotency, queue, events, crypto, health),
  `src/modules/index.ts` (todos los módulos como stubs), `Dockerfile` (`turbo prune api --docker` + `pnpm deploy`) y
  `test/setup/**` (Supabase local).
- Los DTO y contratos de cada módulo van en `packages/contracts/src/modules/<módulo>.ts`; la lógica pura, en `@mirai/domain`.

```bash
pnpm --filter api test        # prueba previa de ts-rest + zod 4
pnpm --filter api typecheck
```

Versiones fijas por la prueba: `@ts-rest/*@3.53.0-rc.1` (la única con zod 4) y NestJS 11.
