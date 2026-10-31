# Mirai 5.0 — Migración a Next.js + shadcn + Supabase (diseño)

> Fecha: 2026-10-31 · Estado: aprobado por el dueño del producto (stack, datos, login, hogares, realtime, servicios gratis).
> Fuente de verdad funcional: `docs/migracion/inventario-1…5.md` (lista de control: nada de la v4.0 se omite).

## 1. Objetivo
Reescribir Mirai 4.0 (HTML único + Express) como una app **Next.js** full-stack (front + back en el mismo proyecto) sobre **Supabase** (Postgres, Auth, Realtime, Storage) desplegada en **Vercel**, con **todas** las funcionalidades actuales, cuentas de usuario multi-dispositivo, hogares con roles, tiempo real y diseño profesional responsive.

## 2. Decisiones
| Tema | Decisión |
|---|---|
| Datos | Tablas normalizadas con RLS por libro/hogar |
| Login | Correo + contraseña, enlace mágico, Google (Supabase Auth) + MFA TOTP nativo |
| Tenencia | `households` → `books` (personal/negocio) → datos. Roles `owner` / `editor` / `viewer` |
| Versión anterior | Se mueve a `/legacy` (referencia + importador de respaldo JSON/localStorage) |
| Tiempo real | Supabase Realtime: Postgres Changes (sincroniza caché), Presence (quién está conectado), Broadcast (avisos) |
| Contador | Enlace firmado (hash en BD), vencimiento y revocación; datos **en vivo** filtrados por permiso (`renta` / `todo`); notas en tiempo real |
| Gamificación | Puntos en libro mayor (`gami_points_ledger`), no se recalculan hacia abajo |
| Correcciones v4 | Tope patrimonio `>` (no `>=`); edad de dependientes al 31-dic; misión "cero vencidos" al cierre de semana; `lastSent` solo si se envió; retención con límite 40 %/1.340 UVT; snapshot del cron leído en vivo de la BD; avisos a medianoche permitidos |

## 3. Stack
Next.js 16.4 (App Router, Turbopack, `proxy.ts`), React 19.3, TypeScript estricto, Tailwind 4, shadcn (CLI 4).
| Uso | Librería |
|---|---|
| UI | shadcn (Radix), lucide-react, next-themes, motion, sonner, cmdk, vaul |
| Datos | @supabase/ssr + supabase-js con tipos generados; TanStack Query 5 (caché, optimista) |
| Formularios | react-hook-form + zod 4 (esquemas compartidos cliente/servidor) |
| Tablas / gráficas | TanStack Table; Recharts 3 (shadcn charts) |
| Fechas | date-fns 4 (+ locale es, TZ America/Bogota), react-day-picker |
| Estado | nuqs (URL), zustand (UI) |
| Arrastre | @dnd-kit (chat flotante) |
| IA | Vercel AI SDK 7 (`ai`, `@ai-sdk/anthropic|openai|google`): streaming + `generateObject` con zod; OCR por visión |
| Correo | Resend, nodemailer (Gmail/SMTP), SendGrid (fetch), React Email |
| Documentos | @react-pdf/renderer (PDF), exceljs (.xlsx real), qrcode.react |
| Pruebas | Vitest (cálculos puros), Playwright (E2E, 1366 px y 400 px) |
| Calidad | ESLint + Prettier; validación de env con zod |

Sin Drizzle/Prisma (saltarían RLS).

## 4. Arquitectura
```
app/
  (auth)/login, registro, recuperar, callback, mfa
  (app)/[book]/…           Una ruta por vista del MENU efectivo (inventario-1 §4.2)
  contador/[token]         Portal público del contador (solo lectura)
  api/cron/*, api/ai/*, api/webhooks/*   Route Handlers
components/ui              shadcn
components/mirai           Piezas propias (KpiCard, MoneyInput, PageHeader, HelpSheet, IsoIcon, EmptyState…)
features/<dominio>/        queries.ts (TanStack), actions.ts (Server Actions), schema.ts (zod), components/
lib/domain/                Cálculos puros portados 1:1 de v4 (engine, fijos, quincena, indicadores, flujo, renta, nómina, gamificación) + pruebas Vitest
lib/supabase/              server.ts, client.ts, proxy.ts, admin.ts (secret key, solo servidor)
lib/crypto.ts              AES-256-GCM (ENCRYPTION_KEY)
supabase/migrations/       SQL versionado (esquema, RLS, triggers, realtime, seeds de referencia)
legacy/                    Mirai 4.0
```
- **Lecturas**: Server Components para el primer pintado (streaming + Suspense + skeleton); TanStack Query en cliente hidratado; Realtime invalida/parcha la caché.
- **Escrituras**: Server Actions validadas con zod → Supabase con la sesión del usuario (RLS). Actualización optimista + toast con "Deshacer" (borrado lógico `deleted_at`).
- **Secretos**: solo servidor. Integraciones y tokens de Google cifrados (AES-256-GCM).
- **Cron**: Vercel Cron diario + `pg_cron`/`pg_net` horario que llama `/api/cron/send` con `CRON_SECRET`.

## 5. Modelo de datos
Ver tablas en la conversación de diseño; resumen:
- Cuentas/hogar: `profiles`, `households`, `household_members`, `household_invitations`, `books`, `family_members`, `book_settings`, `user_preferences`.
- Catálogos: `categories`, `income_categories`, `entities`, `payment_methods`, `keyword_rules`.
- Movimientos: `incomes`, `extra_incomes`, `expenses`, `fixed_expenses`, `fixed_expense_payments`, `subscriptions`, `credit_cards`, `card_purchases`.
- Deudas/patrimonio: `contacts`, `loans`, `loan_payments`, `assets`, `liabilities`, `investments`, `goals`, `emergency_funds`, `fund_movements`, `calendar_events`, `shared_groups`(+people, expenses), `allowances`(+movements), `savings_challenges`.
- DIAN: `tax_years`, `tax_assets`, `tax_dependents`, `attachments`, `accountant_shares`, `accountant_notes`.
- IA/gamificación: `advisor_consultations`, `chat_threads`, `chat_messages`, `monthly_summaries`, `gami_points_ledger`, `gami_badges`, `gami_missions`, `gami_visits`.
- Servidor: `integrations`, `google_connections`, `notification_rules`, `notification_outbox`, `push_subscriptions`, `telegram_links`, `backups`, `audit_log`.
- Referencia: `ref_uvt`, `ref_smmlv`, `ref_renta_calendar`, `ref_fiscal_templates`, `ref_municipalities`, `ref_holidays`, `ref_trm`, `ref_usury_rate`.
Convenciones: `uuid` PK, `book_id` en todo dato, `numeric(18,2)` + `currency`, `date` en TZ Bogotá, `created_by/created_at/updated_at/deleted_at`, enumeraciones como `check`. RLS con `is_book_member(book_id, min_role)` (security definer). Tablas de datos en la publicación `supabase_realtime`.

## 6. Diseño y layout (responsive)
- Estilo Microsoft 365 / Fluent + shadcn, con la limpieza de Meta (superficies blancas, tarjetas con sombra suave, jerarquía clara). Sin header superior: sidebar shadcn colapsable a la izquierda; miga de pan en el contenido.
- Tokens: los valores efectivos del inventario-1 §5.1 mapeados a variables shadcn (`--background #F5F5F5`, `--card #FFF`, `--primary` navy `#1F2B4B` / lima `#9EDB4E` en oscuro, `--accent` forest `#3F7A1E`, `--destructive #C8213B`…). Radios 8/4 px, fuente Segoe UI Variable → fallback Inter/system. Densidad y tamaño de letra configurables.
- Responsive: móvil primero. `<768px`: sidebar como Sheet, barra inferior con 4 accesos + botón Agregar, modales como Drawer (vaul), tablas → tarjetas. `768–1279px`: sidebar contraído a íconos. `≥1280px`: sidebar expandido. Sin scroll horizontal a 360 px.
- Skeletons: `loading.tsx` por ruta con la forma de la vista; Suspense por bloque; `isPending` de TanStack Query.
- Atajos: ⌘K (paleta de comandos), ⌘B (sidebar), N (Agregar), Esc. Modo privado (montos borrosos). `prefers-reduced-motion` respetado.
- Ayuda obligatoria: botón "Cómo funciona" (HELP) por vista, descripción en cada modal (MDESC), ícono de info en cada campo (FHELP), novedades, FAQ, manual, tour.
- Isotipos de `iso/iso.json` convertidos a componentes SVG. Sin logos de terceros.

## 7. Integraciones y servicios (todas activables y ajustables desde Ajustes › Integraciones)
Registro único en código (`lib/integrations/registry.ts`): `id`, categoría, alcance (`household` | `platform`), campos (zod), si es gratis, prueba de conexión. Estado por hogar en `integrations` (`enabled`, `config` jsonb, `secrets_enc` AES-256-GCM, `meta` con máscaras). Las de alcance `platform` (Turnstile, Sentry, Analytics, Upstash) solo las ve/edita el dueño del hogar administrador; sus claves pueden venir de variables de entorno o guardarse cifradas.

| Categoría | Integraciones |
|---|---|
| Datos financieros | TRM e históricos + tasa de usura (datos.gov.co, sin clave) → alerta "este préstamo cobra más de lo legal"; festivos Colombia (Nager.Date) → correr pagos al siguiente día hábil; tasas de cambio (open.er-api.com) → varias monedas (USD/EUR→COP); cripto (CoinGecko); acciones/ETF (Alpha Vantage o Twelve Data) |
| Avisos | Correo: Resend, Brevo, SendGrid, Gmail, SMTP · Telegram Bot (canal gratis principal) · Web Push (VAPID) + PWA instalable · WhatsApp Cloud API (opcional, de pago por mensaje) |
| IA | Gemini (gratis, por defecto: chat, consejero, OCR) · Groq y OpenRouter (respaldo gratis) · Claude y OpenAI (clave propia) · orden de respaldo configurable |
| Google | Login, Gmail (correo del banco, solo lectura), Calendar |
| Infraestructura | pg_cron + pg_net (avisos cada hora, mantiene vivo el plan gratis) · Cloudflare Turnstile (captcha registro/login) · Sentry · Vercel Analytics y Speed Insights · Upstash Redis (límite de peticiones a la IA) |

## 7.1 Producto y cumplimiento
- **Ley 1581 de 2012**: política de tratamiento de datos y términos, aceptación obligatoria al registrarse (versión y fecha guardadas), descargar todos mis datos (JSON + Excel), borrar cuenta (con confirmación y período de gracia).
- **Respaldos**: diario automático por libro en Supabase Storage (retención 30 días) + manual; botón "Restaurar".
- **Historial de cambios** (`audit_log` por triggers): "Ana borró el gasto de la luz", visible en Ajustes y en cada registro.
- **Importar extractos** CSV/Excel (exceljs) con mapeo de columnas, detección de duplicados y categorización automática.
- **Adjuntos** (Storage, bucket privado con RLS): certificados DIAN, facturas, comprobantes; visibles para el contador según permiso.
- **Varias monedas**: cada registro guarda moneda; conversión a COP con la TRM del día (o manual si la integración está apagada).
- **Monitoreo**: Sentry (errores cliente/servidor) + página de estado de integraciones.
- DIVIPOLA completa (municipios oficiales).

## 8. Fases
| Fase | Alcance |
|---|---|
| F0 Fundación | Legacy → `/legacy`; scaffold Next; shadcn + tema; Supabase (clientes, proxy); migraciones base (cuentas, hogares, libros, ajustes, catálogos, referencia, RLS, auditoría, realtime); login (3 métodos) + MFA; onboarding de hogar; shell (sidebar, migas, ⌘K, Agregar, tema, privacidad, notificaciones); skeletons; Vitest + Playwright |
| F1 Mi dinero | Inicio, balance y quincenas, ingresos (nómina), gastos y hormiga, fijos, tarjetas, suscripciones, importar extractos, puesta en marcha |
| F2 Deudas y patrimonio | Contactos, me deben / le debo (motor, pagos previos, acuerdo PDF), empeños, salir de deudas, activos/pasivos, inversiones, metas, fondo de emergencia, aportes, imprevistos |
| F3 Planeación y agenda | Presupuesto 50/30/20, flujo, salud financiera, por miembro, mesadas, compartidos, retos, primas y cesantías, próximos pagos, calendario fiscal y laboral |
| F4 IA | Consejero, chat flotante con historial, OCR, autocategorización y hormiga, correo del banco (Gmail), registro en palabras, resumen del mes, crear categoría/entidad con IA |
| F5 DIAN | Declaración completa, bienes, dependientes, documentos con adjuntos, borrador PDF, Excel .xlsx, acceso del contador |
| F6 Avisos e integraciones | Registro de integraciones + Ajustes › Integraciones (activar/ajustar/probar); reglas de notificación; correo (Resend, Brevo, SendGrid, Gmail, SMTP); WhatsApp; Telegram; Web Push; Google Calendar; cron (Vercel + pg_cron); TRM/usura/festivos/tasas de cambio/cripto/acciones; varias monedas; Upstash |
| F7 Producto | Logros, ayuda (novedades, FAQ, manual, tour), ajustes completos, perfil, ley 1581, respaldos, importador v4, PWA, Sentry, Turnstile |
| F8 Cierre | QA completo (escritorio y 400 px), auditoría de accesibilidad, documentación (CLAUDE.md, AGENTS.md, reglas), guía de despliegue Vercel |

Cada fase termina con: `npm run build` limpio, pruebas en verde y capturas revisadas.
