# @mirai/ai

IA y chat de Mirai que comparten `apps/web` y `apps/api` (F2-F, `docs/arquitectura/v6-separacion-front-back.md` §8).
Antes vivía en `apps/web/lib/ai`, `lib/chat`, `features/ai/classify.ts`, `features/advisor/engine.ts`,
`features/chat/{server,confirm}.ts` y el cuerpo de `app/api/chat/route.ts` y de las Server Actions de IA, chat, correo,
uso de IA, consola › Uso de IA y resumen del mes; esos archivos ahora re-exportan o llaman a este paquete. **El código se
edita aquí.**

- **Puro** (también en el navegador): `features`, `pricing`, `credits`, `compact`, `models`, `prompts`, `router`,
  `errors`, `public-error`, `mail-query` y `chat/*` (los tipos del chat viven en `@mirai/contracts/chat-types`).
- **Solo servidor**: `run` (aiText/aiObject/aiStream con respaldo entre proveedores, caché, cupo, límite y `ai_usage`),
  `model`, `usage`, `limit` y `server/*` (casos de uso que reciben quién llama —`AiCtx`— y el cliente de Supabase de la
  persona). Usan el runtime de `@mirai/services` (`rt().admin()`, `rt().env()`, `rt().loadBook()`): la web lo configura en
  `apps/web/lib/services.ts` y la API en `ServicesRuntime` (+ `AiRuntime` para el nodo de IA de las automatizaciones).
- **Pruebas**: `pnpm --filter @mirai/ai test` con dobles (`MockLanguageModelV4` del AI SDK y `testing/fake-db.ts`, base en
  memoria + runtime falso). Nunca llaman a un proveedor real ni a la base compartida.
