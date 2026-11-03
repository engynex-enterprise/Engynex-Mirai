# @mirai/contracts

Lo que comparten `apps/web` y `apps/api` (F2-A-5, `docs/arquitectura/v6-separacion-front-back.md` §2.4).

| Archivo | Qué trae |
|---|---|
| `src/common.ts` | `Uuid`, `IsoDate`, `IsoMonth`, `Money`, `ApiError` (`{ ok:false, msg, code, requestId?, details? }`), `API_ERROR_STATUS`, `ApiOk()`, `apiError()` |
| `src/zod-es.ts` | `enableZodEs()` (traducción `es` de zod 4 + tono de Mirai) y `fieldErrors()` |
| `src/live.ts` | `LIVE_TABLES`, `HOUSEHOLD_TABLES`, `LiveChange` (los usa `apps/web/hooks/use-realtime.ts`) |
| `src/limits.ts` | `LIMITS` de tasa (los aplica `apps/web/lib/security/rate-limit.ts`) |
| `src/book-tables.ts` | `BOOK_TABLE_POLICY` (CRUD genérico del libro, una fila por tabla con `book_id` + `deleted_at`; la compilación exige las nuevas) y `BOOK_TABLES` (orden de la copia de seguridad) |
| `src/modules/*.ts` | Un stub por módulo de la API (§2.6) con su dueño (F2-B…F2-I). Cada frente llena solo el suyo |
| `src/index.ts` | Todo lo anterior + un namespace por módulo |

Importa por ruta (`@mirai/contracts/live`) desde la web para no arrastrar todo el índice al navegador.
