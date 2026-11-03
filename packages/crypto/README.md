# @mirai/crypto

Cifrado de las credenciales de integraciones (F2-B-7, `docs/arquitectura/v6-separacion-front-back.md` §6.1). Antes vivía
en `apps/web/lib/crypto.ts`; ese archivo ahora re-exporta este paquete (con `server-only`), así que la web no cambia.

- **AES-256-GCM**, IV de 12 bytes, etiqueta de 16. Formato `v1.<iv>.<tag>.<datos>` en base64url (el mismo de la v5:
  `src/crypto.test.ts` descifra un valor cifrado por la v5).
- `encrypt`/`decrypt` leen `ENCRYPTION_KEY` (32 bytes en base64) del entorno, como antes.
  `encryptWith`/`decryptWith` reciben la llave ya validada (la API la lee de su configuración, `CryptoService`).
- `mask("sk-…1234")` → `••••1234`.
- **Solo servidor** (`node:crypto`). Nunca lo importes desde un componente de cliente. `ENCRYPTION_KEY` no se cambia
  nunca en un despliegue existente: las integraciones guardadas quedarían ilegibles.
