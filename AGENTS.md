# AGENTS.md — Mirai

Guía para agentes de código (Codex, Cursor, Copilot, Gemini, Claude…). **Lee `CLAUDE.md` para el contexto completo**; aquí está lo esencial.

## Proyecto
Mirai: finanzas personales y familiares para Colombia, en español, para personas sin conocimientos financieros. Frontend single-file (HTML + JS sin bundler) generado por `build.py` desde `src/`, y servidor Node 20 en `server/` (Vercel + Supabase o Express).

## Comandos
- Instalar: `npm run setup`
- Construir: `npm run build` (obligatorio tras tocar `src/` o `iso/`)
- Probar: `npm test` (19 pruebas Playwright; cada una debe terminar en `[]`)
- Servidor local: `npm run dev` → http://localhost:8080

## Reglas no negociables
1. UI y textos en español de Colombia, tuteo, lenguaje simple. Toda funcionalidad nueva lleva ayuda: `HELP`, `MDESC`, `tip` en campos, entrada en `RELEASES`.
2. No conviertas a `const` las funciones que otros módulos envuelven (render, renderNav, commit, notifs, ajNotif, ajIA, ajServidor, sendEmailDigest, openWa, downloadFile, V.*). El orden de `build.py` importa.
3. Estado en `S`; persiste solo con `commit()`. Vistas = `V.x = () => html`. Modales = `M.x`. Acciones = `EXTRA_ACT.x`. Formularios = `EXTRA_FORM.x`.
4. Sin dependencias nuevas en el frontend. Íconos con `ic('lucide-name')`; isotipos con `isoIcon()`.
5. Secretos solo en el servidor (cifrados). Nada de claves en el repo.
6. Valores tributarios/laborales de Colombia: verificarlos con fuentes oficiales; presentarlos como estimados.
7. Sin logos de marcas de terceros.
8. Cada cambio: build → pruebas → revisar capturas (`tests/.out/`) si tocaste UI. Agrega una prueba E2E por funcionalidad.

## Dónde está cada cosa
Ver tabla de módulos en `CLAUDE.md §3`. Reglas: `.agents/rules/`. Flujos: `.agents/workflows/`. Pendientes: `docs/BACKLOG.md`.
