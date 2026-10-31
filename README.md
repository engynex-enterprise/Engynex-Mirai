# Mirai · Tu futuro financiero

Plataforma de finanzas personales y familiares para Colombia: ingresos, gastos, gastos fijos, préstamos, metas, inversiones, calendario de pagos, DIAN (renta) y más, explicada para personas sin conocimientos financieros.

## Empezar
```bash
npm run setup     # dependencias + Chromium para pruebas
npm run build     # genera dist/mirai.html y server/public/index.html
npm test          # pruebas E2E
npm run dev       # servidor local en http://localhost:8080 (copia server/.env.example a server/.env)
```

## Estructura
- `src/` frontend (módulos concatenados por `build.py`) · `iso/` isotipos · `vendor/` íconos Lucide
- `server/` API (Vercel + Supabase o Express) — ver `server/README.md`
- `tests/` pruebas Playwright · `docs/` backlog e historial · `assets/brand/` logo

## Para agentes de IA
Lee `CLAUDE.md` (Claude Code) o `AGENTS.md` (otros). Reglas en `.agents/rules/`, flujos en `.agents/workflows/`, comandos y subagentes en `.claude/`.

Versión 4.0 · ver `CHANGELOG.md`.
