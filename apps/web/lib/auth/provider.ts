// Auth propio de Mirai (v7): Better Auth en la API, en el mismo origen. La sesión es una cookie httpOnly que el
// navegador manda sola a /api/auth y /v1; el servidor de Next la reenvía a la API como Bearer (lib/auth/server.ts).

/** Cookies de sesión de Better Auth (con https lleva el prefijo __Secure-). */
export const MIRAI_SESSION_COOKIES = ["__Secure-mirai.session_token", "mirai.session_token"]
