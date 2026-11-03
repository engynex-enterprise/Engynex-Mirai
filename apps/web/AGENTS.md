# AGENTS.md — apps/web

App Next.js de Mirai dentro del monorepo. **Lee primero `../../AGENTS.md` y `../../CLAUDE.md`** (idioma, reglas y
estructura). La lógica pura se edita en `../../packages/domain/src` (aquí solo hay re-exportaciones en `lib/domain`).

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
