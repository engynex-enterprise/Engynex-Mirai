# CLAUDE.md — Mirai

> Punto de entrada para Claude Code y cualquier agente. Reglas de dominio en `.agents/rules/`.
> **Estado: migrando de la v4.0 (HTML único, en `legacy/`) a la v5 (Next.js + shadcn + Supabase).**
> Diseño aprobado: `docs/superpowers/specs/2026-10-31-migracion-nextjs-design.md`. Lista de control funcional: `docs/migracion/inventario-1…5.md` (nada de la v4 se omite).

## 1. Qué es Mirai
**Mirai** (未来, "futuro") es una plataforma de **finanzas personales y familiares para Colombia** para personas **sin conocimientos financieros**.
- **Idioma:** UI, textos, comentarios de cara al usuario y respuestas al dueño del producto en **español de Colombia**, con tuteo.
- **Principio:** *extremadamente simple*. Cada sección tiene "Cómo funciona" (`HELP`), cada modal su descripción (`MDESC`), cada campo su ayuda (`fieldHelp()`).
- **Dónde vive:** Vercel (front + back en Next.js) + Supabase (Postgres, Auth, Realtime, Storage).

## 2. Comandos
```bash
npm run dev          # http://localhost:3000 (lee .env.local)
npm run build        # build de producción (debe pasar sin errores)
npm run typecheck    # next typegen + tsc
npm run lint         # ESLint (0 errores)
npm run test         # Vitest: cálculos puros (lib/domain)
npm run test:e2e     # Playwright escritorio 1366 px + móvil 400 px (crea el usuario QA con la clave secreta)
npm run db:migrate   # aplica supabase/migrations/*.sql en orden (SUPABASE_DB_URL)
npm run db:types     # regenera lib/supabase/database.types.ts desde la BD
```
Tras tocar el esquema: `db:migrate` → `db:types` → `typecheck`. Antes de cerrar un cambio: `build` + `test:e2e` y revisar capturas en `tests/.out/`.

## 3. Arquitectura
```
app/
  (auth)/           login (contraseña, enlace mágico, Google), registro (Ley 1581), recuperar, actualizar-clave, verificacion (MFA)
  (onboarding)/     bienvenida (crea hogar + libro con create_household)
  (app)/            shell (sidebar, migas, ⌘K, Agregar, notificaciones) + una ruta por sección del menú
  (app)/[seccion]   página provisional de secciones aún no migradas (lib/migration-status.ts)
  auth/callback|confirm   PKCE / token_hash
  legal/            términos y política de datos
components/ui       shadcn (radix-nova) — no editar salvo ajustes de marca
components/app      shell: app-shell, app-sidebar, command-palette, add-menu, notifications-sheet, help-sheet, mobile-tabbar
components/mirai    piezas propias: IsoIcon, Icon (lucide por nombre), PageHeader…
components/skeletons  esqueletos de carga
hooks/              use-book-data (useList/useSave/useSoftDelete), use-realtime (canal por libro)
lib/dal.ts          getAppContext(): usuario, hogar, libro activo (cookie mirai-book) — solo servidor
lib/domain/         cálculos puros portados 1:1 de la v4 (+ pruebas Vitest)
lib/content/help.ts HELP / MDESC / fieldHelp (textos literales de la v4 en lib/data/legacy-*.json)
lib/nav.ts          menú efectivo de la v4 → rutas
lib/supabase/       database.types.ts (generado), tables.ts (tipos + qk), admin.ts (clave secreta, solo servidor)
utils/supabase/     server.ts, client.ts, middleware.ts (patrón oficial de Supabase)
proxy.ts            Next 16 (antes middleware): refresca la sesión y protege rutas
supabase/migrations SQL versionado e idempotente
legacy/             Mirai 4.0 (referencia; `npm run legacy:extract` saca sus datos a lib/data)
```

### Patrones (léelos antes de tocar código)
- **Next 16 con `cacheComponents`:** todo lo que lea cookies/sesión va dentro de `<Suspense>` con un skeleton. Usa `supabaseServer()` / `getAppContext()` (ya llaman `connection()`).
- **Datos en cliente:** TanStack Query con claves `qk(bookId, tabla, …)`. `useList`, `useSave` (optimista) y `useSoftDelete` (borrado lógico + toast "Deshacer"). Realtime invalida por tabla: si agregas una tabla, añádela a la publicación (migración) y a `LIVE_TABLES` en `hooks/use-realtime.ts`.
- **Seguridad:** RLS en todas las tablas con `is_book_member(book_id, rol)` / `is_household_member`. Roles `owner` > `editor` > `viewer`. Secretos solo en el servidor; integraciones cifradas (AES-256-GCM, `ENCRYPTION_KEY`); el cliente lee `integrations_public`.
- **Borrado lógico:** `deleted_at`; las consultas filtran `deleted_at is null`. La auditoría (`audit_log`) se llena sola por triggers.
- **Formularios:** react-hook-form + zod 4 + componentes `Field*` de shadcn. Mensajes en español.
- **Escrituras con secretos** (IA, correo, cifrado): Server Actions o Route Handlers validados con zod.
- **Responsive:** móvil primero; `<768px` sidebar como Sheet + barra inferior + Drawer (vaul); probar a 400 px sin scroll horizontal.
- **Montos:** marca los valores con `data-money` para el modo privado. Formato COP con `Intl` (`es-CO`).

## 4. Diseño
Microsoft 365 / Fluent + shadcn, limpieza tipo Meta. Paleta Engynex: navy `#1F2B4B`, lima `#9EDB4E`, verde `#3F7A1E`; tokens en `app/globals.css` (claro/oscuro). Isotipos propios (`lib/data/iso.json`, `<IsoIcon k="…"/>`). **Sin logos de marcas de terceros.**

## 5. Dominio Colombia (detalle en `.agents/rules/colombia.md`)
Valores anuales en tablas `ref_*` (con fuente): UVT 2024–2026, SMMLV 2026, festivos 2026, calendario de renta 2026 (general — Decreto 2229/2023 — y plazo especial por el sismo, Decreto 1226/2026). Verifícalos con fuentes oficiales (subagente `finanzas-colombia`) antes de cambiarlos; nunca se inventan. Todo cálculo tributario es **estimado**.

## 6. Reglas de trabajo
1. Español en UI y respuestas; términos técnicos explicados.
2. Cambios pequeños y verificables: `build` → `test:e2e` → capturas.
3. Prueba E2E por funcionalidad (`tests/e2e/`), pruebas Vitest por cálculo (`lib/domain/*.test.ts`) comparadas con la v4.
4. Cada sección migrada: reemplaza su entrada en `lib/migration-status.ts` por una ruta real en `app/(app)/<id>/page.tsx` y cubre TODO lo de su inventario.
5. Integraciones: registro único (`lib/integrations/registry.ts`), activables/ajustables en Ajustes › Integraciones.
6. No metas secretos en el código. `.env.local` está en `.gitignore`; producción usa variables de Vercel (`.env.example`).

## 7. Gotchas
- `components/ui/command.tsx`: `CommandDialog` NO envuelve en `<Command>`; hazlo tú.
- `useList` filtra por `book_id`; las tablas por hogar (`family_members`, `integrations`) se consultan aparte.
- Supabase Auth: configurar Site URL, Redirect URLs (`/auth/callback`, `/auth/confirm`), proveedor Google y SMTP propio en el panel.
- Cron en Vercel Hobby: 1 vez al día → avisos horarios con `pg_cron` + `pg_net`.

## 8. Documentación
`AGENTS.md` (resumen para otros agentes) · `.agents/rules/` · `.claude/agents/` (finanzas-colombia, qa-playwright, ux-simple) · `docs/BACKLOG.md` · `docs/HISTORIAL.md` · `docs/migracion/` · `docs/superpowers/specs/`.
