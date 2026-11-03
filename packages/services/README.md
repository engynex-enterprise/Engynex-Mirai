# @mirai/services

Código del servidor que comparten `apps/web` y `apps/api` (F2-E, `docs/arquitectura/v6-separacion-front-back.md` §8):
avisos, integraciones, Google, datos de referencia y automatizaciones del servidor. Antes vivía en `apps/web/lib/notify`,
`lib/integrations/registry.ts`, `features/integrations/{store,refresh,data-sources}.ts`, `lib/google*.ts`,
`lib/plan-server.ts`, `lib/automations/{detect,notify,notify-rules,server}.ts` y `lib/security/safe-{url,next}.ts`; esos
archivos ahora re-exportan este paquete (los `import "@/lib/…"` de la web no cambian). **El código se edita aquí.**

- **Contexto (`runtime.ts`)**: cada app llama una vez a `configureServices()` con el cliente de la base (clave secreta),
  el cifrado (`@mirai/crypto`), las variables, `siteUrl()` y el cargador del libro. La web: `apps/web/lib/services.ts`
  (`supabaseAdmin()`, `process.env`). La API: `modules/integrations/services-runtime.ts` (SystemScope, `CryptoService`,
  `ServicesEnv`). Las pruebas lo configuran con dobles.
- **Isomórfico** (también en el navegador): `integrations/registry`, `notify/{rules,schedule,whatsapp,wa-templates,email-kinds}`,
  `automations/{detect,notify-rules}`, `security/safe-next`. **Solo servidor**: lo demás (no importa `server-only` para
  poder correr en Node/NestJS; la web lo agrega en sus re-exportaciones).
- `ServiceError`: condición que no se cumple, con un mensaje para la persona. La web lo muestra igual; la API lo
  responde como 400/404/409 con ese texto.
- Simulación (`dry`): `runRule`, `runDigests`, `cronHeartbeat`, `planEmails` y `syncCalendarsOfUser` calculan sin
  enviar ni escribir (tick de la API con `dry=1`, §4 paso 9).
- WhatsApp: plantilla del caso, de respaldo **propia** aprobada o texto libre; nunca las de ejemplo de Meta
  (`esPlantillaDeMeta`) en un aviso real.

`pnpm --filter @mirai/services test` (dobles: sin base ni envíos reales) · `typecheck` · `lint`.
