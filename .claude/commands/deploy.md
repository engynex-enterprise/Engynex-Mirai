---
description: Sube a producción (VPS + Dokploy) verificando antes, con migraciones y comprobación final
argument-hint: "[--sin-e2e si la batería ya pasó con este mismo código]"
---
Sube lo que está en el árbol de trabajo a producción siguiendo `.agents/workflows/deploy-vps.md` paso a paso. $ARGUMENTS

Reglas:
- Push a `main` = producción. No subas nada si `lint`, `typecheck`, `test` o `e2e:local` fallan (salvo una prueba
  intermitente que pasa al repetirla: dilo en el reporte). Con `--sin-e2e`, salta la batería solo si ya pasó con este código.
- Antes del commit: `node scripts/revisar-secretos.mjs --todo` y revisa `git status`. Nunca imprimas `.env.local`,
  tokens ni contraseñas.
- Migraciones nuevas (`db/postgres/0004_*` en adelante): `pnpm db:migrate:vps -- --pendientes` y, si hay, aplícalas
  con `pnpm db:migrate:vps` **antes** del push. Confirma que son aditivas (compatibles con el código publicado).
- Después del push: espera el CI y `Desplegar VPS` del mismo commit en `success`, y verifica `/login`, `/api/auth/ok`
  y `/sw.js` en https://mirai.engynex.com (200).
- No uses `git push --force` ni `rm -rf`.

Al final entrega en español: commit, migraciones aplicadas, resultado de pruebas y despliegue, y lo pendiente.
