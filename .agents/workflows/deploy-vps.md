# Subir a producción (VPS Hostinger + Dokploy)

Producción = rama `main` → https://mirai.engynex.com. Push a `main` → CI en verde → `Desplegar VPS` (Dokploy).
No hay ambiente de pruebas en línea: todo se verifica antes en este computador. Guía del servidor: `infra/servidor/README.md`.

## 1. Verificar en local
```bash
pnpm lint && pnpm typecheck && pnpm test
pnpm e2e:local            # batería completa 1366 px y 400 px contra Docker local (no lances dos a la vez)
```
- Si falla una prueba: corrige la causa (no la prueba, salvo que el cambio pedido la dejó desactualizada) y repite
  solo esa (`pnpm e2e:local -- <archivo>`). Una que falla y pasa al repetir es intermitente: dilo en el reporte.
- Revisa las capturas de `apps/web/tests/.out/` de lo que cambió (escritorio y celular).

## 2. Revisar el diff
- `git status` y `git diff --stat`: solo lo esperado. Nada de `.env*`, `*.dump`, `*.secretos`, capturas con datos reales.
- `node scripts/revisar-secretos.mjs --todo` (lo corre también el hook de pre-commit). Nunca imprimas `.env.local` ni tokens.

## 3. Commit
- Mensaje en español: qué cambia para la persona, luego el detalle técnico. Con la línea de atribución del agente si aplica.

## 4. Migraciones de la base (ANTES del push)
```bash
pnpm db:migrate:vps -- --pendientes   # solo lista lo que falta
pnpm db:migrate:vps                   # aplica db/postgres/0004_* en adelante por túnel SSH (idempotente)
```
- Deben ser **aditivas** (el código que está publicado sigue funcionando con el esquema nuevo). Si una cambia o
  restringe algo, va detrás de un interruptor en `platform_settings`, o se sube primero el código compatible.
- Si la migración cambia una función que usa la API (RPC), la API la toma al desplegar.

## 5. Push y seguimiento
```bash
git push origin main
gh run list --branch main --limit 3                 # CI y luego "Desplegar VPS"
gh run watch <id-del-CI> --exit-status
```
- Espera a que `Desplegar VPS` del mismo commit termine en `success`.

## 6. Verificar producción
```bash
for u in /login /api/auth/ok /sw.js; do curl -s -o /dev/null -w "%{http_code} $u\n" https://mirai.engynex.com$u; done
```
- Esperado: 200 en las tres. Una ruta de la app sin sesión responde 307 (al login): está bien.
- Si algo falla: `Actions › Desplegar VPS` (registro) y Dokploy (registros del servicio). Revertir = `git revert` + push.

## 7. Reporte
En español, largo: qué cambió para la persona, con ejemplos en pesos; pruebas (qué pasó, qué fue intermitente);
migraciones aplicadas; lo que quedó pendiente.
