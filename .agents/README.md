# .agents

Instrucciones neutrales (sirven para cualquier agente de IA) para trabajar en Mirai.

- `rules/` — reglas permanentes: qué respetar siempre.
  - `architecture.md` — cómo está hecho el frontend y el servidor.
  - `code-style.md` — convenciones de código.
  - `ux-copy.md` — diseño, tono y textos.
  - `colombia.md` — datos y reglas de Colombia (laboral, DIAN, impuestos locales).
  - `security.md` — datos personales, secretos y cifrado.
  - `cifras.md` — montos, cálculos, proyecciones y mensajes: una sola cifra en toda la app (no las rompas).
- `workflows/` — pasos para tareas recurrentes.
  - `deploy-vps.md` — subir a producción (VPS + Dokploy), con migraciones y verificación.
  - `migracion.md` — cambiar el esquema de la base (db/postgres) con tipos y contratos.
  - `build-test.md`, `add-feature.md`, `release.md` (v4, referencia) y `deploy-vercel.md` (histórico).

Claude Code usa además `.claude/` (comandos `/deploy`, `/migracion`, `/test`…, subagentes como `auditor-cifras`, el flujo
`auditoria-modulos` y el hook que revisa secretos) y `CLAUDE.md`.

Secretos: `scripts/revisar-secretos.mjs` corre antes de cada commit (hook de git en `.githooks/`, se activa con
`pnpm install`; a mano: `pnpm secretos`). Falso positivo: `secretos:ok` en esa línea.
