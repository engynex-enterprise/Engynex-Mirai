# Seguridad y datos personales

- Mirai maneja información financiera y de menores de edad (dependientes). Trátala como sensible.
- **Secretos**: solo en el servidor. Credenciales de integraciones cifradas con AES-256-GCM (`ENCRYPTION_KEY`) en `mirai_integrations`; el cliente recibe solo máscaras (`••••1234`). Si se cambia de proveedor de correo no se reutilizan claves del anterior.
- **Acceso del contador**: cifrado de extremo a extremo. La llave (32 bytes) va en `#k=` (fragmento: no viaja al servidor). El servidor guarda solo el blob cifrado y un `verifier` (SHA-256) para permitir notas. Accesos con vencimiento y revocables. No registres el fragmento ni el blob en logs.
- Supabase: RLS activado y `revoke all` para `anon`/`authenticated`; solo la `service_role` (en el servidor) accede.
- `MIRAI_TOKEN` y `CRON_SECRET` largos y aleatorios. CORS con `ALLOWED_ORIGINS` en producción.
- Contraseña local con PBKDF2 y 2FA (`g_auth.js`): protege el dispositivo, no reemplaza autenticación de servidor.
- Frontend: escapar todo con `esc()`; no usar `innerHTML` con datos sin escapar; no cargar scripts de dominios distintos a cdnjs.
- Nunca subas `.env`, respaldos `.json` del usuario ni capturas con datos reales al repositorio.
