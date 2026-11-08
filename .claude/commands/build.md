---
description: Compila Mirai (web, API y paquetes) y corrige lo que falle
---
Desde la raíz: `pnpm lint && pnpm typecheck && pnpm build` (Turborepo guarda caché por paquete; `pnpm build --force` para saltarla).
Si falla, ubica el paquete en la salida de Turborepo (`web:`, `api:`, `@mirai/domain:`…) y corrige la causa en ese paquete
(el código de dominio se edita en `packages/*`, no en las re-exportaciones de `apps/web/lib`). Si un cambio de `app/globals.css`
no aparece, mira el gotcha de la caché de Turbopack en `CLAUDE.md`. Reporta en español qué falló y qué corregiste.
