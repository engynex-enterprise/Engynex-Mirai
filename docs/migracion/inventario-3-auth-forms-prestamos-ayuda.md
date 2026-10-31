# Inventario 3 — Acceso, formularios, ubicaciones, préstamos y ayuda

> Parte del plan de migración de Mirai 4.0 (HTML único en `src/`) a **Next.js + shadcn/ui + Supabase**.
> Cubre `src/g_auth.js`, `src/h_forms.js`, `src/i_geo.js`, `src/j_loans.js` y `src/k_ayuda.js` (leídos completos), con referencias a `b_core.js`, `d_app.js` y `c_views.js` cuando el comportamiento depende de ellos.
> Análisis hecho el 31 oct 2026 sobre el commit `72c3d27`. **Solo análisis**: no se modificó código.

Convenciones de este documento:
- `S` = estado global; `S.cfg` = configuración; `commit()` = persistir; `toast()` = alias de `toastX()` (definido en `d_app.js`: `function toast(msg,o={}){return toastX(msg,o)}`).
- "→ Next" = recomendación para la reimplementación.
- Los textos entre comillas son **literales** del código; consérvalos tal cual (español de Colombia, trato de "tú").

---

## Índice
1. [g_auth.js — Cuenta de acceso, 2FA y bloqueo](#1-g_authjs--cuenta-de-acceso-2fa-y-bloqueo)
2. [h_forms.js — Ayuda por campo, descripciones de modales, toasts y creación con IA](#2-h_formsjs--ayuda-por-campo-descripciones-de-modales-toasts-y-creación-con-ia)
3. [i_geo.js — Ciudades de Colombia y parseo de direcciones](#3-i_geojs--ciudades-de-colombia-y-parseo-de-direcciones)
4. [j_loans.js — Préstamos, pagos previos, OCR, empeños, suscripciones, imprevistos, fondo, aportes](#4-j_loansjs--préstamos-pagos-previos-ocr-empeños-suscripciones-imprevistos-fondo-y-aportes)
5. [k_ayuda.js — Versión, novedades, FAQ y manual](#5-k_ayudajs--versión-novedades-faq-y-manual)
6. [Riesgos, inconsistencias y decisiones pendientes](#6-riesgos-inconsistencias-y-decisiones-pendientes)

---

## 1. g_auth.js — Cuenta de acceso, 2FA y bloqueo

### 1.1 Qué es (y qué no es)
Es una **cuenta de acceso local**: protege la *pantalla* de Mirai en el navegador. **No** es autenticación de servidor: los datos financieros siguen en `localStorage` sin cifrar y la verificación ocurre en el cliente. La cuenta se guarda:
- **Modo `nube`** (solo dentro de claude.ai): si existen las capacidades `useCap('user')` y `useCap('db')`, en `db.collection('data/users/'+uid).doc('cuenta')` (privado por usuario de Claude). Marca `store.set('nido-tiene-cuenta',1)`.
- **Modo `local`**: `store.get('nido-cuenta')` (localStorage).

→ Next: reemplazar por **Supabase Auth** (correo + contraseña, verificación de correo, MFA TOTP nativo `supabase.auth.mfa.*`). Lo que Supabase no trae (códigos de respaldo, bloqueo por inactividad, "pedir iniciar sesión al abrir") se implementa aparte (ver 1.11).

### 1.2 Primitivas criptográficas (Web Crypto)
| Función | Detalle exacto |
|---|---|
| `b64(buf)` / `rnd(n)` / `hex(buf)` | Base64 de bytes · `crypto.getRandomValues(new Uint8Array(n))` · hex en minúsculas. |
| `pbkdf2(pass, salt, iter=210000)` | `PBKDF2`, **hash SHA-256**, sal = base64 de **16 bytes aleatorios**, **210.000 iteraciones**, `deriveBits` **256 bits**, resultado en **base64**. |
| `sha256(s)` | SHA-256 en hex (se usa para códigos de respaldo y código de correo). |
| `b32enc/b32dec` | Base32 RFC 4648 (`A–Z2–7`), sin relleno; `b32dec` ignora `=` y caracteres inválidos, mayúsculas. |
| `totp(secret, t)` | **RFC 6238**: HMAC-**SHA-1**, periodo **30 s**, **6 dígitos**, contador de 8 bytes big-endian, truncamiento dinámico estándar. |
| `verifyTotp(secret, code)` | Limpia no-dígitos; acepta ventana **−1, 0, +1** periodos (±30 s). |
| `pwScore(p)` (0–4) | +1 si largo ≥ 8; +1 si mayúsculas **y** minúsculas; +1 si dígito; +1 si símbolo `[^A-Za-z0-9]`; +1 si largo ≥ 12; tope 4. **Se exige ≥ 3**. |
| `pwReqs(p)` | Lista mostrada: "Mínimo 8 caracteres", "Mayúsculas y minúsculas", "Al menos un número", "Al menos un símbolo (!, #, *…)". |
| `emailOk(e)` | `/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/` sobre el texto recortado. |
| `maskEmail(e)` | Usuario de ≤2 letras → primera letra + `*`; si no, 2 primeras letras + `*` por cada letra restante (mín. 1) + `@dominio`. |

### 1.3 Modelo de datos de la cuenta (`AUTH.acc`)
```js
{ v:1, nombre, email /* minúsculas, recortado */, salt /* b64 16 B */, iter:210000, hash /* b64 */,
  creado /* ISO */, ultimo /* ISO, último ingreso */, emailVerificado:false,
  totp:{ on:false, secret:'' /* base32 de 20 bytes */, desde /* ISO */ },
  backup:[ { h /* sha256 hex del código */, used:false } ],
  lock:{ n /* intentos fallidos */, hasta /* epoch ms */ },
  autolock:15 /* minutos; 0 = nunca */, requerir:true /* pedir login al abrir */ }
```
Estado en memoria: `AUTH = {acc, ready, mode:'local'|'nube', ref, view, tmp, err, busy}`. `AUTH.tmp` guarda datos de la pantalla en curso (`email`, `nombre`, `secret`, `codes`, `emailCode` (hash), `emailExp`, `enviado`, `sinCorreo`, `metodo`, `usarBackup`, `rem`, `desdeAjustes`).

### 1.4 Sesión
- Clave `nido-sesion`: `{k: hash.slice(0,16), exp, rem}`.
- Siempre en `sessionStorage`; **si "Recordarme"** también en `localStorage`.
- Duración: **30 días** con "Recordarme", **12 horas** sin él.
- `sesGet()` invalida la sesión si `k` no coincide con el hash actual (⇒ **cambiar la contraseña cierra las demás sesiones**) o si expiró.
- `sesClear()` borra ambas. Saltar la cuenta: `sessionStorage['nido-skip']='1'`.

→ Next: Supabase maneja la sesión (refresh token). "Recordarme" ≈ persistir sesión vs. sesión de pestaña; los 12 h / 30 d se pueden emular con el JWT expiry + chequeo de `last_sign_in_at`.

### 1.5 Arranque (`authBoot`, llamado desde `z_boot.js`)
1. `body.locked`, vista `loading` ("Preparando tu libro…").
2. `loadAccount()`.
3. Sin cuenta: si `nido-skip` → entra sin cuenta; si no → pantalla `bienvenida`.
4. Con cuenta: si `requerir===false` **o** hay sesión válida → entra; si no → `login`.

### 1.6 Pantallas (`SCREENS`) y textos
Layout: panel de marca a la izquierda (isotipo `mirai`, "Las finanzas de tu familia, claras y en orden.", 4 rasgos con isotipos: `consejero` "Un consejero con IA antes de gastar", `me-deben` "Préstamos y cobros sin olvidos", `metas` "Metas y ahorro con propósito", `recordatorios` "Avisos antes de cada pago"; mosaico decorativo `inversiones, presupuesto, tarjetas, calendario, retos, mesadas`; pie "Contraseña protegida con cifrado PBKDF2 · Verificación en dos pasos") + tarjeta a la derecha. Enfoque automático del primer input si ancho > 700 px.

| Vista | Contenido |
|---|---|
| `loading` | Isotipo, "Mirai", "Preparando tu libro…", skeleton. |
| `bienvenida` | "Bienvenido a Mirai" / "Las finanzas de tu familia, claras y en orden. Crea tu cuenta para proteger el acceso a tu libro." Botones "Crear mi cuenta", "Ya tengo cuenta"; enlace "Usar Mirai sin cuenta por ahora"; nota "Tus datos financieros solo los ven las personas con quienes compartas el libro." |
| `login` | "Inicia sesión"; subtítulo "Hola de nuevo, {nombre}. Escribe tu contraseña para entrar." o "Entra con tu correo y contraseña." Campos: Correo electrónico (prellenado), Contraseña (con ojo mostrar/ocultar), checkbox "Recordarme en este dispositivo" (marcado), enlace "¿Olvidaste tu contraseña?". Botón "Iniciar sesión" / "Verificando…". Si no hay cuenta: "¿No tienes cuenta? Créala aquí". |
| `registro` | "Crea tu cuenta" / "Te tomará un minuto. Después configuramos juntos tu libro." Campos: Nombre completo (prellena `S.perfil.nombre`), Correo, Contraseña + **medidor** (4 barras, texto y checklist), Confirma la contraseña, checkbox "Acepto el tratamiento de mis datos personales para el uso de Mirai, conforme a la Ley 1581 de 2012 (Habeas Data)." Botón "Crear cuenta" / "Creando tu cuenta…". |
| `verificarEmail` | "Verifica tu correo"; estados: enviando ("Enviando el código a tu correo…"), enviado ("Te enviamos un código de 6 dígitos a **{email}**. Revisa también la carpeta de spam." + 6 casillas OTP + "Verificar" + "Reenviar el código"), sin correo ("No pudimos enviar el correo desde esta vista." + nota de Gmail en claude.ai y "Ajustes › Seguridad"). Botón "Verificar después"/"Continuar". |
| `2fa-setup` | "Verificación en dos pasos" + explicación; pasos: instalar Google Authenticator / Microsoft Authenticator / Authy; escanear QR; escribir el código. QR + "¿No puedes escanear? Escribe esta clave:" (secreto en grupos de 4) + "Copiar clave". OTP + "Activar verificación en dos pasos". Botón "Configurar después" (o "Cancelar" si viene de Ajustes). |
| `backup` | "Guarda tus códigos de respaldo" + explicación (sirven una vez; guárdalos fuera del celular). Lista de códigos, "Copiar", "Descargar", checkbox obligatorio "Ya guardé mis códigos en un lugar seguro", botón "Entrar a Mirai"/"Listo". |
| `2fa` | Pide código TOTP (6 casillas) o, con el enlace "¿No tienes tu celular? Usa un código de respaldo", un campo `XXXX-XXXX` (monoespaciado, mayúsculas). Enlaces alternar y "Volver". |
| `recuperar` | "Recupera tu cuenta"; métodos disponibles según la cuenta: `app` (si TOTP activo), `backup` (si quedan códigos sin usar), `email` (si hay correo; muestra correo enmascarado), `claude` (solo modo nube: "Confirmar con mi sesión de Claude"). Sin cuenta: "Aún no hay una cuenta creada en este libro." + "Crear cuenta". |
| `recuperar-codigo` | Pide código según método (OTP o `XXXX-XXXX`); en correo, espera a que se envíe. Enlace "Elegir otro método". |
| `nueva-clave` | "Crea una contraseña nueva" / "Usa una que no hayas usado antes en otros sitios." Contraseña nueva + medidor + confirmación. "Guardar y entrar". |
| `lock` | Avatar + nombre, "Mirai se bloqueó por inactividad para proteger tu información." Contraseña + "Desbloquear". Enlaces "¿Olvidaste tu contraseña?" · "Cambiar de cuenta" (logout). |

**Medidor de contraseña** (en `#a_pass`): barras pintadas hasta `score` con color `['#C8213B','#E08A00','#9EDB4E','#3F7A1E'][score-1]`; textos `['Muy débil','Débil','Aceptable','Buena','Muy segura'][score]`; checklist con `circle-check`/`circle`.

**Casillas OTP**: 6 inputs numéricos (`autocomplete="one-time-code"` en el primero, `aria-label="Dígito n"`); al escribir avanza al siguiente, Backspace en vacío retrocede, pegar distribuye hasta 6 dígitos, y al completar 6 **envía el formulario solo**. → Next: componente `InputOTP` de shadcn.

### 1.7 Flujos (submit `data-aform`)
**Registro**: valida en orden → "Escribe tu nombre." · "Escribe un correo válido, por ejemplo nombre@correo.com." · score < 3 → "La contraseña es muy débil. Cumple los requisitos de la lista." · "Las contraseñas no coinciden." · sin términos → "Debes aceptar el tratamiento de datos para continuar." Luego crea la cuenta (1.3), `saveAccount()`, `sesSet(true)`, va a `verificarEmail` y envía el código.

**Login / Desbloqueo (`lock`)**:
1. Sin cuenta → "No hay una cuenta creada todavía."
2. Si `lock.hasta > ahora` → "Demasiados intentos. Intenta de nuevo en {min} minuto(s) o recupera tu cuenta."
3. (solo login) correo distinto al guardado → "El correo o la contraseña no son correctos."
4. PBKDF2 con `salt`/`iter` guardados. Si falla: `lock.n++`; al llegar a **5** → `lock.hasta = ahora + 5 min` y `n=0`; mensajes "Demasiados intentos fallidos. Tu acceso quedó bloqueado 5 minutos." o "El correo o la contraseña no son correctos. Te quedan {5-n} intentos."
5. Éxito: `lock={n:0,hasta:0}`, `ultimo=ahora`, guarda; `rem` = checkbox (en `lock` siempre true). Si TOTP activo → vista `2fa`; si no → `entrar()` + toast "¡Hola, {nombre}!".

**2FA al entrar**: TOTP o código de respaldo. Errores: "Ese código de respaldo no es válido o ya se usó." / "El código no es correcto. Revisa que la hora de tu celular esté bien configurada." Con respaldo: toast "Te quedan {n} códigos de respaldo".

**Verificar correo**: `sendEmailCode()` genera 6 dígitos (`Math.random`, 100000–999999), guarda **solo su SHA-256** en `AUTH.tmp.emailCode` con vencimiento **15 min**, y lo envía con `mcpCall('Gmail','send_message',…)` (solo funciona en claude.ai). Asunto "Tu código de Mirai: {code}"; cuerpo: "Hola {nombre},\n\nTu código de verificación de Mirai es: {code}\n\nVence en 15 minutos. Si no lo pediste, ignora este mensaje.\n\nMirai · Tu futuro financiero". Error → "El código no es correcto o ya venció."; éxito → `emailVerificado=true`, toast "Correo verificado", `afterEmail()`.

**`afterEmail()`**: si no hay TOTP → genera secreto (20 bytes, base32) y abre `2fa-setup`; si ya hay → entra.

**Activar 2FA**: verifica el código contra el secreto temporal ("El código no coincide. Escribe el que aparece ahora en tu app."); guarda `totp={on:true,secret,desde}`; genera códigos y muestra `backup`.
- URI: `otpauth://totp/Mirai:{email}?secret={S}&issuer=Mirai&digits=6&period=30`.
- QR con `qrcodejs` (CDN): 168×168, oscuro `#1F2B4B`, claro `#fff`, corrección M. Fallbacks: "No se pudo dibujar el QR. Usa la clave." / "El código QR no cargó. Escribe la clave manualmente en tu app."

**Códigos de respaldo (`genCodes`)**: **8** códigos; cada uno = `b32enc(5 bytes aleatorios)` → 8 caracteres → formato `XXXX-XXXX`. Se guardan como `{h: sha256(código), used:false}` (reemplaza los anteriores). `useBackup` compara `sha256(trim().toUpperCase())` y marca `used`. Descarga: archivo `mirai-codigos-de-respaldo.txt` con "Códigos de respaldo de Mirai\nCuenta: {email}\nGenerados: {fecha}\n\n{códigos}\n\nCada código sirve una sola vez." `aBackupDone` exige el checkbox ("Confirma que guardaste tus códigos"); toasts "¡Tu cuenta está protegida!" o "Verificación en dos pasos activada".

**Recuperar cuenta**: elige método → `recuperar-codigo` (para `email` envía código) → valida ("El código no es válido. Intenta de nuevo.") → `nueva-clave`. Método `claude` salta directo a `nueva-clave` (confía en la sesión de claude.ai). `nueva-clave`: score ≥ 3 ("La contraseña es muy débil. Cumple los requisitos."), coincidencia, nueva sal, nuevo hash, resetea `lock`, toast "Contraseña actualizada", entra con "recordar".

**`entrar(rem)`**: `sesSet(rem)`, limpia `tmp`, si el perfil no tiene nombre copia el de la cuenta (`commit()`), oculta la capa y renderiza.

**`logout()`**: borra sesión, cierra popover y modal, muestra `login`.

### 1.8 Acciones (`EXTRA_ACT`) y formularios de Ajustes
| Acción | Efecto |
|---|---|
| `aGo` (`data-v`) | Cambia de pantalla; si pide `registro` y ya hay cuenta → `login`. |
| `pwEye` | Alterna tipo password/text e ícono `eye`/`eye-off`. |
| `aSendEmail`, `aAfterEmail` | Reenviar código; continuar tras verificar. |
| `aSkip2fa` | Desde Ajustes: cierra. Si no: entra + toast "Puedes activar la verificación en dos pasos en Ajustes › Seguridad". |
| `aCopySecret`, `aCopyCodes`, `aDlCodes` | Portapapeles ("Clave copiada", "Códigos copiados", fallback "Selecciona y copia los códigos") y descarga. |
| `aBackupDone`, `aToggleBackup`, `aRecMethod` | Ver 1.7. |
| `aLogout`, `secLogout` | `logout()`. |
| `aSkip` | `nido-skip=1`, entra, toast "Puedes crear tu cuenta cuando quieras en Ajustes › Seguridad". |
| `secLock` | Muestra `lock` ya. |
| `sec2faOn` | Nuevo secreto, `desdeAjustes:true`, `2fa-setup`. |
| `sec2faOff` | Exige código TOTP **o** de respaldo en `#sec2faCode` ("Escribe un código válido de tu app o de respaldo para desactivarla"); borra TOTP y códigos; toast "Verificación en dos pasos desactivada". |
| `secCodes` | Regenera los 8 códigos y muestra `backup`. |
| `secVerifyEmail`, `secCrear` | Verificar correo desde Ajustes; crear cuenta. |
| `secDelAcc` | Exige escribir `ELIMINAR` ("Escribe ELIMINAR para confirmar"); borra doc en nube y `nido-cuenta`/`nido-tiene-cuenta`, cierra sesión; toast "Cuenta de acceso eliminada. Tus datos financieros siguen intactos." |
| `EXTRA_FORM.secPass` | Contraseña actual correcta ("La contraseña actual no es correcta"), nueva score ≥ 3 ("La contraseña nueva es muy débil"), coincidencia; nueva sal+hash, `sesSet(true)`, "Contraseña actualizada". |
| `EXTRA_CHANGE.secAuto` | Guarda `autolock` (min) → "Guardado". |
| `EXTRA_CHANGE.secReq` | Guarda `requerir` → "Se pedirá iniciar sesión" / "Ya no se pedirá iniciar sesión al abrir". |

### 1.9 Ajustes › Seguridad (`seguridadTab`, usada en `c2_views.js`)
- **Sin cuenta**: alerta "Aún no tienes cuenta de acceso" + "Crear mi cuenta".
- **Tu cuenta**: avatar, nombre, correo, pill "Verificado"/"Sin verificar"; nota "Cuenta creada el … · último ingreso … · guardada de forma privada en tu cuenta de Claude | en este navegador"; botones "Verificar correo" (si falta), "Bloquear ahora", "Cerrar sesión".
- **Verificación en dos pasos** (pill Activa/Inactiva): texto "Pide un código de tu celular además de la contraseña…"; si activa: "Códigos de respaldo disponibles: n de m", "Generar códigos nuevos", campo "Para desactivarla, escribe un código" (`123456 o XXXX-XXXX`) + "Desactivar"; si no: "Activar verificación en dos pasos".
- **Cambiar contraseña**: actual, nueva (hint "Mínimo 8 caracteres con mayúsculas, minúsculas, números y símbolos."), confirmación.
- **Bloqueo y sesión**: select "Bloquear Mirai tras inactividad" = 5 min / 15 min / 30 min / 1 hora / Nunca (0); switch "Pedir iniciar sesión al abrir Mirai" + nota "Si "Recordarme" está activo, la sesión dura 30 días en ese dispositivo."; alerta "Cómo se protege tu información" (menciona PBKDF2 210.000 iteraciones y claude.ai → **actualizar texto** en Next).
- **Zona roja** "Eliminar cuenta de acceso" (no borra datos financieros; remite a "Datos y cuenta").

### 1.10 Bloqueo por inactividad
- `lastAct` se actualiza con `pointerdown`, `keydown`, `scroll` (captura, pasivo) y al ocultar la capa.
- `setInterval` cada **15 s**: si hay cuenta, `autolock>0`, no hay vista de auth abierta, `body` no está `locked` y `requerir!==false`, y pasaron `autolock` minutos → `authShow('lock')`.
- El desbloqueo usa el mismo flujo del login (incluye 2FA si está activa y cuenta intentos).

### 1.11 → Next: mapeo propuesto
| Hoy | Supabase / Next |
|---|---|
| PBKDF2 local | `supabase.auth.signUp / signInWithPassword` (bcrypt en servidor). Política de contraseña: replicar `pwScore ≥ 3` en cliente y configurar mínimo en Supabase. |
| Código por correo (Gmail MCP) | Confirmación de correo de Supabase (OTP o enlace) y `resetPasswordForEmail` / `verifyOtp` para recuperar. |
| TOTP propio | `auth.mfa.enroll({factorType:'totp'})`, `challenge`, `verify`; AAL2 requerido en middleware. Mantener textos y URI/issuer "Mirai". |
| Códigos de respaldo | **No existen en Supabase**: tabla propia `mfa_backup_codes(user_id, hash, used_at)` con RLS + Edge Function para validar y desenrolar factor. Mantener 8 códigos `XXXX-XXXX`. |
| Bloqueo 5 intentos / 5 min | Rate limit de Supabase Auth + contador propio si se quiere el mensaje "Te quedan n intentos". |
| `autolock`, `requerir` | Preferencias del perfil (`profiles.autolock_min`, `profiles.require_login`); la pantalla de bloqueo pide reautenticación (`reauthenticate` o `signInWithPassword`). |
| Método "Confirmar con mi sesión de Claude" | Eliminar (no aplica fuera de claude.ai). |
| "Usar Mirai sin cuenta" | Decidir: con datos en Supabase la cuenta pasa a ser obligatoria (o modo invitado local). |

---

## 2. h_forms.js — Ayuda por campo, descripciones de modales, toasts y creación con IA

### 2.1 Normalizador `FN(s)`
Quita HTML, quita tildes (NFD + rango combinante), minúsculas, reemplaza `¿?¡!:*().%$` por espacio, colapsa espacios, recorta. Se usa en **todo** el proyecto para comparar textos (categorías, entidades, ciudades, búsquedas). → Next: `lib/text.ts#normalize`.

### 2.2 FHELP — ayuda por campo
- `FHELP_RAW` (173 entradas, tabla completa en 2.9) se indexa por `FN(etiqueta)`. `o_asesor.js` agrega más entradas con `Object.assign(FHELP_RAW…)` (fuera de este inventario).
- **Búsqueda `fieldHelp(label)`**, en este orden:
  1. Coincidencia exacta de `FN(label)`.
  2. Primera clave de longitud > 5 tal que la etiqueta **empiece** por la clave o la clave empiece por la etiqueta (por eso existen claves cortadas como "¿Ya hiciste el último pago").
  3. Reglas genéricas `FKEYS` (regex sobre la etiqueta normalizada):
     | Regex | Texto |
     |---|---|
     | `correo\|email` | "Dirección de correo electrónico." |
     | `contrasena\|clave` | "Tu clave de acceso. Mínimo 8 caracteres." |
     | `codigo` | "El código de verificación de 6 dígitos." |
     | `fecha\|cuando` | "El día correspondiente. Toca para abrir el calendario." |
     | `tasa\|interes` | "Porcentaje de interés. Si no aplica, deja 0." |
     | `cuota` | "Número o valor de las cuotas del pago." |
     | `valor\|cuanto\|monto\|cupo\|salario\|precio` | "La cantidad de dinero en pesos. Se formatea sola mientras escribes." |
     | `dia` | "Día del mes (1 a 31)." |
     | `nombre` | "Un nombre para reconocerlo fácilmente." |
     | `quien` | "La persona relacionada con este movimiento." |
     | `categoria` | "El grupo al que pertenece el movimiento." |
     | `nota\|descrip\|que ` | "Una descripción corta para recordarlo." |
  4. Por defecto: "Completa este dato para que los cálculos y alertas sean exactos."
- **`enhanceFields(root)`**: para cada `.f` sin `data-enh`, toma el texto del `<label>`/`.fl` (sin el `.tip`), junta: el `data-tip` del `.tip` existente (va primero) + los `.hint` sin `id` y sin elementos interactivos (se **eliminan** del DOM); si lo juntado mide > 40 caracteres se omite el texto base de FHELP; une sin duplicados con " · ". Inserta `<button class="finfo" data-tip aria-label="Información sobre {etiqueta}">` con ícono `info`.
- Se ejecuta con un `MutationObserver` sobre `body` (agrupado en `requestAnimationFrame`).
- **Tooltip flotante `#ftip`** (`role=tooltip`): ancho máx. `min(300, innerWidth-24)`, centrado sobre el botón, arriba (si no cabe, abajo con clase `below`), flecha `--ax`; se abre con hover, foco o clic (toggle), se cierra al hacer scroll, Escape, clic afuera o perder foco. También sirve para `.tip`.

→ Next: componente `<Field label help? hint?>` que resuelve la ayuda con `fieldHelp()` en build/render y la muestra con `Tooltip` (desktop) / `Popover` (táctil) de shadcn. Mantener el diccionario como `lib/help/fhelp.ts` copiado tal cual. Los `hint` que hoy se borran pasan al tooltip.

### 2.3 MDESC — descripción de cada ventana
`renderModal()` (d_app.js) muestra `r.d || MDESC[tipo]` bajo el título. 24 entradas aquí (tabla en 2.10); otros módulos agregan `miembro` (o_asesor), `fplant` (p_calendario), `bien`, `depend`, `contador` (s_dian). → Next: prop `description` de `DialogDescription`.

### 2.4 Notificaciones `toastX(msg, o)`
- Tipos `TOAST_T`: `success` (circle-check, "Listo"), `error` (circle-x, "No se pudo completar"), `warn` (triangle-alert, "Revisa esto"), `info` (info, "Aviso"), `del` (trash-2, "Eliminado").
- **Tipo automático `toastType(msg)`** si no se pasa `o.type`:
  - `del` si contiene `eliminad|borrad|se quit`.
  - `warn` si **empieza** por `escribe|elige|no se|no hay|no pud|error|falt|debes|este contacto|ingresa|selecciona|primero|el valor|la contraseña|el código` o contiene `incorrect|inválid|no coincide`.
  - `success` si contiene `guardad|registrad|cread|actualizad|listo|agregad|import|enviad|copiad|descargad|activad|conectad|marcad|¡`.
  - si no, `info`.
- Caso especial: `msg==='Guardado'` sin título → título "Cambios guardados", texto "Se guardaron automáticamente.", success.
- **Deduplicación**: el mismo mensaje en < 2,5 s se ignora (salvo con `undo`).
- **Duración**: 7.000 ms con `undo`; 5.200 ms warn/error; 3.600 ms resto; `o.dur` la sobreescribe. Máximo **4** visibles (se quita el más viejo). `role=alert` para warn/error, `status` para el resto. Pausa con hover (conserva el tiempo restante); barra de progreso; botón cerrar.
- **Opciones**: `title`, `type`, `dur`, `undo` (snapshot completo de `S`; "Deshacer" hace `S=o.undo; commit(); render()` y muestra "Recuperamos lo que habías eliminado." con título "Deshecho"), `action:{l, fn}`.
- `DEL_N` + `delMsg(col, it)`: "{El gasto fijo|El gasto|El ingreso|La meta|La suscripción|La inversión|El registro|La fecha|El contacto|La tarjeta|El elemento} "{nombre|desc|concepto|titulo}" se eliminó."

→ Next: `sonner` (shadcn) con un wrapper `notify(msg, opts)` que conserve `toastType`, duraciones, dedupe y "Deshacer". Con Supabase, "Deshacer" no puede ser "restaurar todo `S`": implementar **borrado diferido** (soft delete + revertir) o reinsertar la fila borrada.

### 2.5 Crear categoría desde el desplegable
- El `sel()` con `create` agrega `data-create="cat"` (también `create:1/true` → `cat`), `ent` o `city`. Al pintar la lista, `selCreateFoot(c)` añade el pie según el tipo.
- **Pie `cat`**: botón "Crear "{búsqueda}"" (o "Crear categoría") y "Que la IA la cree".
- **Mini-modal `#modal2`** "Nueva categoría" / "Crea un grupo para clasificar tus gastos. Aparecerá en tus listas, presupuesto y reportes.":
  - Caja IA "Que la IA la proponga": si hay contexto (`ctxDesc`: primer valor no vacío de `desc`, `nombre`, `titulo`, `concepto` del formulario padre) dice "Usará "{desc}" para sugerir nombre, ícono y tipo."; si no "Escribe una idea en el nombre y la IA completa el resto." Botón "Sugerir" → "Pensando…" → "Sugerir otra vez".
  - Campos: Nombre de la categoría (req, máx. 40, "Ej. Mascotas"); ¿Qué tipo de gasto es? (Necesidad `n` / Gusto `g` / Ahorro `a`, por defecto `g`); Ícono (select con búsqueda: `ICON_CHOICES` + `paw-print, dumbbell, gift, plane, sparkles, baby, heart, landmark, smartphone, car`); Tope mensual (opcional).
  - **`aiCat(desc, nombre)`** (si `S.cfg.ia.asist!==false` y hay `claude.use('sample')`), `modelTier:'quick'`, prompt literal:
    ```
    Eres asistente de finanzas familiares en Colombia. El usuario necesita una NUEVA categoría de gasto.
    Gasto o idea: "{desc||nombre}". [Nombre sugerido por el usuario: "{nombre}".]
    Categorías que YA existen (no repitas): {lista}.
    Íconos permitidos (elige uno EXACTO): {ICON_CHOICES}.
    Responde JSON {"nombre":"2-3 palabras en español, con mayúscula inicial","icon":"uno de la lista","grupo":"n|g|a" (n=necesidad, g=gusto, a=ahorro),"tope":número de pesos mensual razonable o 0,"razon":"máx 12 palabras"}
    ```
    Saneo: nombre ≤ 40; ícono válido o `tag`; grupo válido o `g`; tope entero ≥ 0; razón ≤ 90.
  - **Respaldo local `localCatGuess`** (regex sobre texto normalizado):
    | Regex | Nombre | Ícono | Grupo |
    |---|---|---|---|
    | `mascota\|perro\|gato\|veterin` | Mascotas | paw-print | n |
    | `gym\|gimnas\|deporte\|futbol` | Deporte | dumbbell | g |
    | `regalo\|cumple` | Regalos | gift | g |
    | `viaje\|hotel\|vuelo\|tiquete` | Viajes | plane | g |
    | `belleza\|pelu\|barber\|unas` | Cuidado personal | sparkles | g |
    | `bebe\|panal\|ninos\|hijos` | Hijos | baby | n |
    | `donac\|iglesia\|diezmo` | Donaciones | heart | g |
    | `impuesto\|predial\|dian` | Impuestos | landmark | n |
    | `celular\|plan movil\|telefon` | Telefonía | smartphone | n |
    | `moto\|carro\|taller\|mecanic` | Vehículo | car | n |
    Si nada coincide: nombre = lo escrito o 2 primeras palabras de la descripción, `tag`, `g`. Mensajes: razón de la IA o "Sugerencia lista. Puedes ajustarla antes de crearla."; sin IA: "La IA no está disponible ahora; te dejamos una sugerencia. Ajústala si quieres." Validación sin texto: "Escribe una idea en el nombre (por ejemplo "comida del perro") y la IA la completa."
  - **Guardar** ("Crear y usar"): nombre vacío → "Escribe el nombre de la categoría."; si ya existe (comparando `FN`) la reutiliza; si no, agrega `{id, nombre, icon, grupo, tope}` a `S.cfg.categorias` y `commit()`. Inserta la opción (con `h` = Necesidad/Gusto/Ahorro) en el select, la selecciona, marca `form.dataset.catManual=1` (desactiva la categoría automática) y limpia `#catHint`. Toasts: "Categoría creada" — ""X" quedó en tu lista y ya está seleccionada." / "Categoría seleccionada" — ""X" ya existía; la seleccionamos."

### 2.6 Crear banco o entidad desde el desplegable
- Tipos `ENT_T`: Banco, Cooperativa, Fintech, Casa de empeño, Compañía de financiamiento, Almacén o comercio, Fondo de empleados, Empresa, Persona. Íconos: Persona → `user`, Almacén → `store`, resto → `landmark`.
- Pie `ent`: "Crear "{q}"" / "Crear banco o entidad" y "Que la IA la identifique (nombre o NIT)".
- Mini-modal "Nuevo banco o entidad" / "Agrega quién te prestó o te vende a crédito: un banco, cooperativa, fintech, almacén o empresa. Quedará disponible en todas tus listas." Caja IA "Que la IA la identifique" / "Escribe el nombre, la sigla o el NIT y completamos el resto." → "Identificar" / "Buscando…" / "Identificar otra vez". Campos: Nombre (req, máx. 60, "Ej. Cooperativa Confiar"), NIT o documento (numérico, máx. 14, "Ej. 890903938"), Tipo de entidad (por defecto Banco). Si lo buscado parece número (`NIT_RE=/^\d[\d.\s-]{5,}$/`) va al NIT en vez del nombre.
- **Dígito de verificación DIAN `nitDV(n)`**: pesos `[3,7,13,17,19,23,29,37,41,43,47,53,59,67,71]` aplicados de derecha a izquierda; `r = suma % 11`; DV = `r>1 ? 11-r : r`. Con ≥ 8 dígitos muestra "NIT con dígito de verificación: **{nit}-{dv}**. Verifícalo en el RUT o en el contrato del crédito."
- **`aiEnt(q)`** prompt literal (`modelTier:'quick'`):
  ```
  Identifica una entidad que presta dinero o vende a crédito en Colombia a partir de este dato del usuario: "{q}" (puede ser un nombre comercial, una sigla, un NIT o un número de documento).
  Tipos permitidos: {ENT_T}.
  Responde JSON {"nombre":"nombre comercial conocido","razon_social":"razón social si la conoces o vacío","nit":"NIT sin dígito de verificación, solo números, o vacío si no estás seguro","tipo":"uno de los tipos","confianza":"alta|media|baja","nota":"máx 15 palabras"}.
  No inventes NIT: si no lo conoces con certeza déjalo vacío. Si el dato es un número de cédula de una persona, tipo="Persona" y nombre vacío.
  ```
  Saneo: nombre ≤ 60, razón ≤ 80, NIT solo dígitos ≤ 12, tipo válido o Banco, nota ≤ 100. Resultado: "{razón}. {nota}" + si confianza ≠ alta "**Confirma los datos antes de guardar.**" + si duplicado "Ya tienes "X" en tu lista." Sin IA: "La IA no está disponible ahora. Completa los datos a mano."
- **Guardar**: nombre vacío → "Escribe el nombre de la entidad."; busca existente por NIT o `FN(nombre)`; si no existe agrega `{id, nombre, tipo, nit}` a `S.cfg.entidades`; si existe sin NIT y se escribió uno, lo completa. Opción con `h` = "Tipo · NIT n". Toasts "Entidad creada"/"Entidad seleccionada" análogos a categorías.

### 2.7 Otros comportamientos de formularios en h_forms
- **Pie `city`** (`cityCreateFoot`): solo si hay búsqueda → "Usar "{q}" como ciudad" (primera letra en mayúscula, `h:'Otra ciudad'`).
- **Gasto fijo: rango vs. fijo**. `SERV_RE=/agua|acueducto|luz|energ|electric|gas\b|gas natural|internet|wifi|fibra|celular|movil|plan |claro|movistar|tigo|wom|telefon|tv|cable|servicio|alcantarill|aseo|basura/`. Al escribir el nombre (> 2 caracteres) del formulario `fijo`, si el usuario no tocó manualmente `tipoValor`, selecciona `rango` (servicio) o `fijo`, y muestra en `#tvHint`: "Detectamos que es un servicio: su valor cambia según el consumo, así que te pedimos un rango."
- **Vista previa de rango** (`#rgPrev`, envuelve `updatePreviews`): con mínimo `a` y máximo `b` → "Para tus cálculos usaremos el promedio" **promedio = round(((a‖b)+(b‖a))/2)** y "Te avisaremos si una factura sale por fuera de {min} – {max}, y ajustaremos el rango con tus pagos reales."; sin datos → "Escribe cuánto pagas en un mes bajo y en uno alto. Usaremos el promedio para tu presupuesto."
- **¿Gasto fijo o deuda?** `DEBT_RE=/cuota|credito|prestamo|financ|celya|addi|sistecredito|brilla|meddipay|tarjeta|leasing|a cuotas|televisor|celular a/` (nombre > 3 caracteres) → caja "¿Es una compra a cuotas o un crédito?" / "Si compraste algo a cuotas (como un televisor con Celya o Addi) regístralo como deuda: así ves cuánto te falta, los intereses y cuándo terminas." Botón "Registrar como deuda": cierra el modal, abre `loan` (`kind:'pagar'`) y copia el nombre a `concepto`.
- **Atajo de teclado N** (v3.9): sin modificadores, sin estar escribiendo, sin modal, sin chat abierto y sin pantalla bloqueada → clic en `.sb-create` (Agregar).

### 2.8 → Next (h_forms)
- `FN`, `fieldHelp`, `FKEYS`, `toastType`, `nitDV`, `localCatGuess`, `SERV_RE`, `DEBT_RE` → funciones puras en `lib/` con pruebas unitarias.
- Crear categoría/entidad: `Combobox` (shadcn `Command`) con `CommandFooter` + `Dialog` anidado; la IA vía `/api/ai` (Route Handler) con el mismo prompt y `modelTier quick`.
- Categorías y entidades → tablas `categories(id, household_id, nombre, icon, grupo, tope)` y `entities(id, household_id, nombre, tipo, nit)` con índice único sobre `normalize(nombre)` por hogar.

### 2.9 Tabla completa FHELP_RAW (173 entradas, literal)
| # | Etiqueta del campo (clave) | Texto de ayuda |
|---|---|---|
| 1 | ¿El valor que escribiste es lo que te llega a la cuenta? | Si escribes tu salario o el valor del contrato (antes de descuentos), calculamos salud, pensión, retención y otros descuentos para usar lo que realmente te llega. |
| 2 | Otros descuentos | Lo que te descuentan además de la seguridad social: libranzas, cooperativa, fondo de empleados, medicina prepagada, aportes voluntarios a pensión o AFC. |
| 3 | ¿Cuánto vas a guardar cada vez? | El valor fijo que apartarás cada quincena o mes. Empieza con algo que puedas cumplir siempre; luego lo subes. |
| 4 | Día del mes | El día en que te recordamos hacer el aporte. Lo ideal es el día en que te pagan. |
| 5 | Logo (opcional) | Sube el logo o una imagen del servicio (por ejemplo, una captura del ícono de la app). Si no subes nada, mostramos la inicial con el color del servicio. |
| 6 | ¿Qué pasó? | Una descripción corta del imprevisto. Queda en tus gastos con la categoría Imprevistos. |
| 7 | ¿Cuánto guardas? | El dinero que separas hoy para emergencias. |
| 8 | ¿Cuánto costó? | Lo que pagaste por el imprevisto. Si es más de lo que hay en el fondo, el resto sale de tu dinero del día a día. |
| 9 | ¿Dónde lo guardas? | Dónde está ese dinero: un bolsillo de Nequi, una cuenta de ahorros aparte o un CDT. Lo ideal es que no lo uses para nada más. |
| 10 | ¿Qué empeñaste? | El objeto que dejaste como garantía. Si no pagas a tiempo, la casa de empeño puede quedarse con él. |
| 11 | ¿Qué te dejaron? | El objeto que te dejaron como garantía del préstamo. |
| 12 | ¿Cuánto vale aproximadamente? | Lo que costaría reemplazar el objeto. Sirve para saber cuánto arriesgas si no se paga. |
| 13 | Fecha límite para recuperarlo | Último día para pagar (o refrendar) y recuperar el objeto. Aparece en la boleta o contrato. Te avisamos 15 días antes. |
| 14 | Número de contrato o boleta | El número que aparece en la boleta de empeño. Te sirve para reclamar el objeto. |
| 15 | Elige un servicio o escribe otro | Toca un servicio para llenar el nombre, o escribe cualquier otro. |
| 16 | ¿Con qué se paga? | La tarjeta o cuenta donde se hace el cobro automático. Te ayuda a saber qué cancelar si cambias de tarjeta. |
| 17 | ¿La compartes? | Si dividen el plan con otras personas, contamos solo tu parte en tus gastos. |
| 18 | Paga mínimo | Lo que pagas en un mes de bajo consumo. Míralo en tus facturas anteriores. |
| 19 | Paga máximo | Lo que pagas en un mes de alto consumo. Si una factura lo supera te avisamos y ajustamos el rango. |
| 20 | ¿Cuándo es el próximo pago? | La fecha de la siguiente factura o cobro. Desde ahí contamos los periodos, así nada aparece vencido si este mes no tocaba pagar (por ejemplo, el agua en Bogotá se paga cada dos meses). |
| 21 | Día de la 1ª quincena | Día del mes en que pagas la primera quincena (del 1 al 15). |
| 22 | Día de la 2ª quincena | Día del mes en que pagas la segunda quincena (del 16 al 31). |
| 23 | ¿Qué día lo pagaste? | La fecha en que hiciste ese último pago. Queda en tu historial de gastos con esa fecha. |
| 24 | ¿Qué día pagaste? | La fecha en que pagaste la quincena o quincenas que marcaste. |
| 25 | ¿Cuánto pagaste? | El valor de la factura que pagaste. Si lo dejas vacío usamos el promedio. |
| 26 | ¿Cuánto pagaste en cada quincena? | El valor de cada quincena pagada. Si lo dejas vacío usamos el promedio. |
| 27 | ¿El valor es siempre igual? | Elige "Cambia cada mes" para servicios como agua, luz, gas, internet o plan de celular, cuyo valor depende del consumo. |
| 28 | ¿Ya pagaste alguna quincena de este mes? | Marca las quincenas que ya pagaste este mes para que no te las recordemos. |
| 29 | ¿Ya hiciste el último pago | Si ya pagaste la factura anterior, regístrala con su fecha para que quede en tu historial. |
| 30 | Nombre de la categoría | Un nombre corto y claro, por ejemplo "Mascotas" o "Regalos". |
| 31 | ¿Qué tipo de gasto es? | Necesidad: indispensable. Gusto: prescindible. Ahorro: dinero que separas para el futuro. Se usa en la regla 50/30/20. |
| 32 | Tope mensual | Máximo que quieres gastar al mes en esta categoría. Te avisamos al acercarte. |
| 33 | NIT o documento | Número de identificación tributaria de la entidad (sin el dígito de verificación). Aparece en el contrato, el extracto o la factura. Si es una persona, su cédula. |
| 34 | Tipo de entidad | Qué clase de entidad es: banco, cooperativa, fintech, almacén que vende a crédito, empresa o persona. |
| 35 | % Ahorro | Parte de tus ingresos que separas para ahorro, metas e inversión. Lo recomendado es mínimo 20%. |
| 36 | % Gustos | Parte de tus ingresos para lo que disfrutas pero no es indispensable: salidas, compras, viajes. Lo usual es 30%. |
| 37 | % Necesidades | Parte de tus ingresos para lo indispensable: vivienda, servicios, mercado, transporte y cuotas. Lo usual es 50%. |
| 38 | A una tasa E.A. de | Tasa Efectiva Anual: lo que rinde o cuesta el dinero en un año completo. Es la que aparece en los extractos y ofertas de los bancos. |
| 39 | Avisar cuando una categoría llegue al de su tope | Te avisamos cuando una categoría consuma este porcentaje de su presupuesto del mes, para que alcances a frenar. |
| 40 | Avisarme con | Cuántos días antes de la fecha quieres recibir el recordatorio. |
| 41 | Avisarme con días de anticipación | Cuántos días antes de la fecha quieres recibir el recordatorio. |
| 42 | Año gravable | El año de ingresos y gastos que vas a declarar. En 2026 normalmente se declara el año gravable 2025. |
| 43 | Banco | La entidad donde tienes la cuenta, tarjeta o producto. Sirve para agrupar y reconocer tus movimientos. |
| 44 | Banco o entidad | Quién emite el producto: banco, cooperativa, fintech o almacén. |
| 45 | Bloquear Mirai tras inactividad | Si no usas la plataforma durante este tiempo, se bloquea y pide tu contraseña de nuevo. |
| 46 | Cada cuánto | Con qué frecuencia se repite este movimiento. |
| 47 | Categoría | Grupo al que pertenece el movimiento (mercado, transporte, salud…). Se sugiere sola cuando escribes la descripción; puedes cambiarla. |
| 48 | Celular o teléfono | Número de contacto. Se usa para recordatorios de cobro por WhatsApp. |
| 49 | Ciudad | Ciudad donde vive o se ubica. Solo es informativo. |
| 50 | Ciudad o municipio | Elige de la lista de municipios de Colombia. Si escribes la dirección con la ciudad, la seleccionamos sola. |
| 51 | Barrio o sector | Barrio, conjunto o sector. Se completa solo si lo escribes en la dirección (por ejemplo "barrio Cedritos"). |
| 52 | Concepto | Para qué es el dinero: "préstamo para la moto", "arriendo", etc. Te ayuda a recordarlo después. |
| 53 | Confirma la nueva | Escribe otra vez la contraseña nueva para evitar errores de digitación. |
| 54 | Consignaciones del año | Suma de todo el dinero que entró a tus cuentas en el año. Es uno de los topes que te obligan a declarar renta. |
| 55 | Consumos totales del año | Lo que gastaste en el año con tarjetas y compras. Si superas el tope, debes declarar renta aunque ganes poco. |
| 56 | Contacto | La persona o empresa relacionada. Puedes elegirla de tus contactos guardados. |
| 57 | Contraseña actual | La contraseña que usas hoy para entrar. La pedimos para confirmar que eres tú. |
| 58 | Contraseña nueva | Mínimo 8 caracteres. Combina letras, números y un símbolo para que sea segura. |
| 59 | Contraseña | Tu clave de acceso. Nunca la guardamos en texto plano: se protege con cifrado. |
| 60 | Correo | Dirección de correo electrónico. |
| 61 | Correo electrónico | Tu correo. Lo usamos para enviarte códigos de verificación y recuperar tu cuenta. |
| 62 | Corte de la primera quincena | Día del mes que separa la primera de la segunda quincena (normalmente 15). Se usa para dividir tu balance en quincenas. |
| 63 | Crédito | El préstamo sobre el que quieres hacer la simulación o el abono. |
| 64 | Cupo mensual | Máximo que quieres gastar al mes en esta categoría o persona. Te avisamos al acercarte. |
| 65 | Cupo total | El límite de crédito que te aprobó el banco en esta tarjeta. |
| 66 | Código de respaldo | Uno de los 10 códigos que guardaste al activar la verificación en dos pasos. Cada uno sirve una sola vez. |
| 67 | Código | El código de 6 dígitos que te enviamos o que muestra tu app de autenticación. |
| 68 | Descripción corta | Un nombre corto para reconocer el movimiento, por ejemplo "Almuerzo oficina". |
| 69 | Dirección | Escríbela como la dirías: "calle 80 numero 15-20 apto 301 Chía". La ordenamos al formato colombiano y detectamos la ciudad, el departamento y el barrio. Aparece en documentos como pagarés. |
| 70 | Día de corte | Día en que el banco cierra el ciclo de la tarjeta. Lo que compres después pasa al siguiente extracto. |
| 71 | Día de pago | Día del mes en que se debe pagar. |
| 72 | Día límite de pago | Último día para pagar sin intereses de mora. Te recordamos antes. |
| 73 | Dólar hoy | Tasa Representativa del Mercado del dólar. Se usa para convertir inversiones o deudas en dólares a pesos. |
| 74 | Enlace | Dirección web (https://…) que se abre al tocar este acceso. |
| 75 | Escribe BORRAR para confirmar | Medida de seguridad: escribe la palabra exacta para confirmar que quieres borrar los datos. No se puede deshacer. |
| 76 | Escribe ELIMINAR | Medida de seguridad: escribe la palabra exacta para confirmar. No se puede deshacer. |
| 77 | Escribe ELIMINAR para confirmar | Medida de seguridad: escribe la palabra exacta para confirmar. No se puede deshacer. |
| 78 | Euro hoy | Valor del euro en pesos. Se usa para convertir valores en euros. |
| 79 | Fecha | El día en que ocurrió o vence el movimiento. |
| 80 | Fecha del pago | El día en que se hizo o se hará el pago. |
| 81 | Fecha del préstamo | El día en que se entregó el dinero. Desde aquí se cuentan las cuotas. |
| 82 | Filtro de Gmail | Búsqueda que usamos para encontrar en tu correo las notificaciones de compras de tu banco. Puedes ajustarla. |
| 83 | Forma de calcular la cuota | Francés: cuota fija (lo más común). Alemán: abono a capital fijo, cuota que baja. Simple: interés solo sobre el capital inicial. Americano: solo intereses y el capital al final. |
| 84 | Interés mensual | Porcentaje que se cobra cada mes sobre lo que se debe. Si no hay intereses, deja 0. |
| 85 | Interés mensual de tu tarjeta | La tasa mes vencido que aparece en tu extracto. Sirve para calcular cuánto te cuesta diferir una compra. |
| 86 | Límite de gastos hormiga al mes | Máximo que aceptas gastar al mes en pequeños gastos (cafés, snacks, domicilios). Te avisamos al pasarte. |
| 87 | Medio de pago | Con qué pagaste: efectivo, débito, tarjeta de crédito o transferencia. |
| 88 | Mensaje | El texto que se enviará. Puedes editarlo o mejorarlo con IA. |
| 89 | Mes | El mes que quieres ver o registrar. |
| 90 | Mesada | Valor que recibe periódicamente esta persona. |
| 91 | Meses de fondo de emergencia | Cuántos meses de gastos quieres tener ahorrados para imprevistos. Lo recomendado es entre 3 y 6. |
| 92 | Moneda | Moneda en la que se muestran los valores. |
| 93 | Nombre | Cómo quieres llamarlo para reconocerlo fácilmente. |
| 94 | Nombre completo | Tu nombre y apellidos. Aparece en tu perfil y en los documentos que generes. |
| 95 | Nombre del grupo | Por ejemplo "Viaje a Cartagena" o "Apartamento". Sirve para dividir gastos con otras personas. |
| 96 | Nombre para reconocerla | Un nombre corto, por ejemplo "Visa Bancolombia". |
| 97 | Notas | Cualquier detalle extra que quieras recordar. Es opcional. |
| 98 | Nueva categoría | Nombre de la categoría que quieres agregar a tu lista. |
| 99 | Nueva relación | Tipo de relación con tus contactos, por ejemplo "Compañero de trabajo". |
| 100 | Número de cuotas | En cuántos pagos se divide la deuda. |
| 101 | Número de documento | Número de identificación. Se usa en documentos como el pagaré. |
| 102 | O pega aquí el contenido | Copia y pega el texto del extracto. Separador ; o , · fechas dd/mm/aaaa · valores como 1.234.567,89 o -45000. |
| 103 | Ocupación | A qué te dedicas. Ayuda al consejero a darte recomendaciones más acertadas. |
| 104 | Pantalla al abrir el libro | La sección que verás primero cada vez que entres. |
| 105 | Para desactivarla, escribe un código | Por seguridad, escribe un código de tu app de autenticación antes de quitar la verificación en dos pasos. |
| 106 | Parentesco | Relación familiar con esta persona. |
| 107 | Por | Durante cuántos días. |
| 108 | Próximo cobro | Fecha del siguiente cargo. Te recordamos antes de que llegue. |
| 109 | Relación | Qué relación tienes con este contacto: familiar, amigo, trabajo… |
| 110 | Segundo pago | Si te pagan quincenal, el día del segundo pago del mes. |
| 111 | Seguros y otros cobros por cuota | Valor fijo que se suma a cada cuota: seguro de vida, cuota de manejo, etc. |
| 112 | Servicio | Nombre de la suscripción: Netflix, Spotify, gimnasio… |
| 113 | Si contiene | Texto que, si aparece en la descripción, activa esta regla automáticamente. |
| 114 | Si pongo | El dinero que piensas invertir, para simular cuánto ganarías. |
| 115 | Tasa de usura | Tasa máxima legal que se puede cobrar en Colombia. La publica la Superfinanciera cada mes. |
| 116 | Tasa que te ofrecieron | La tasa efectiva anual que te ofrece el banco o la entidad. |
| 117 | Tipo | La clase de movimiento o producto. |
| 118 | Tipo de documento | Cédula, cédula de extranjería, pasaporte o NIT. |
| 119 | Tu meta financiera principal | Lo más importante que quieres lograr con tu dinero. El consejero prioriza sus consejos según esta meta. |
| 120 | Tu salario mensual | Lo que recibes al mes después de descuentos. Es la base para calcular presupuestos y alertas. |
| 121 | Valor | La cantidad de dinero en pesos. |
| 122 | Valor de cada cuota | Lo que se paga en cada cuota. Si lo dejas vacío, lo calculamos con la tasa y el plazo. |
| 123 | Valor de la UVT | Unidad de Valor Tributario que fija la DIAN cada año. Se usa para calcular los topes de renta. |
| 124 | Valor de la compra | El total de la compra antes de dividirla en cuotas. |
| 125 | Valor de referencia de un gasto hormiga | Gastos por debajo de este valor se consideran "hormiga". La IA también los detecta por el tipo de compra. |
| 126 | Valor del abono | Dinero extra que pagas además de la cuota. Va directo a capital y reduce intereses. |
| 127 | Valor estimado | Un valor aproximado. Puedes actualizarlo después. |
| 128 | Valor pagado | Lo que se pagó realmente. Si es más que la cuota, el excedente se toma como abono. |
| 129 | ¿A cuántas cuotas? | Número de meses en que diferirás la compra. Más cuotas = cuota más baja pero más intereses. |
| 130 | ¿A quién? | La persona o entidad que recibe el dinero. |
| 131 | ¿Cada cuánto se paga? | Frecuencia de las cuotas: mensual, quincenal, semanal… |
| 132 | ¿Cada cuánto? | Con qué frecuencia se repite. |
| 133 | ¿Cuándo lo invertiste? | Fecha en que abriste la inversión. Desde aquí calculamos rendimientos y vencimiento. |
| 134 | ¿Cuántas cuotas? | En cuántos pagos se divide. |
| 135 | ¿Cuánto cuesta? | El valor en pesos de lo que vas a pagar. |
| 136 | ¿Cuánto dinero pusiste? | El capital inicial de la inversión. |
| 137 | ¿Cuánto más puedes pagar al mes? | Dinero adicional que podrías destinar cada mes a tus deudas para salir más rápido. |
| 138 | ¿Cuánto necesitas? | El valor total que quieres reunir para esta meta. |
| 139 | ¿Cuánto tienes ya? | Lo que ya llevas ahorrado para esta meta. |
| 140 | ¿Cuánto vale hoy? | Valor actual de la inversión o del bien. |
| 141 | ¿Cuánto? | La cantidad de dinero en pesos. |
| 142 | ¿Cómo lo pagarías? | Con qué medio harías el pago. Influye en el consejo (no es igual contado que a cuotas). |
| 143 | ¿Cómo lo pagas? | Con qué medio pagas: efectivo, débito, tarjeta… |
| 144 | ¿Cómo pagaste? | Con qué medio pagaste: efectivo, débito, tarjeta… |
| 145 | ¿Cómo te sientes con el riesgo? | Conservador: prefieres no perder. Moderado: aceptas algo de variación. Arriesgado: buscas más rentabilidad aunque varíe. |
| 146 | ¿De quién es? | A quién de la familia pertenece el movimiento. Sirve para ver cuánto gasta cada uno. |
| 147 | ¿De quién son estos gastos? | Persona de la familia a la que se asignarán los movimientos importados. |
| 148 | ¿De qué fue? | Descripción corta del movimiento. |
| 149 | ¿En cuántas cuotas? | Número de pagos en que se divide. |
| 150 | ¿En qué gastaste? | Escribe una descripción corta. La categoría se sugiere automáticamente. |
| 151 | ¿Entre quiénes se divide? | Personas que comparten este gasto. Se reparte en partes iguales. |
| 152 | ¿Es gasto hormiga? | Gastos pequeños y frecuentes que suman mucho al mes. Lo recomendable es dejar que la IA lo detecte. |
| 153 | ¿O te dieron una tasa anual? | Si te dieron la tasa Efectiva Anual (E.A.), escríbela aquí y calculamos la mensual por ti. |
| 154 | ¿Para cuándo? | Fecha en la que quieres lograrlo. Calculamos cuánto ahorrar al mes. |
| 155 | ¿Para qué fue? | El motivo del movimiento, para recordarlo después. |
| 156 | ¿Por cuánto tiempo? | Plazo de la inversión en días (por ejemplo, un CDT a 90, 180 o 360 días). |
| 157 | ¿Quién gasta normalmente? | La persona a la que se asignan los gastos por defecto. |
| 158 | ¿Quién gastó? | Quién de la familia hizo el gasto. |
| 159 | ¿Quién pagó? | Quién puso el dinero. Así calculamos quién le debe a quién. |
| 160 | ¿Quiénes participan? | Personas que hacen parte de este grupo o reto. |
| 161 | ¿Qué compraste? | Descripción corta de la compra. |
| 162 | ¿Qué día te pagan? | Día del mes en que recibes tu salario. Lo usamos para el flujo de caja y los recordatorios. |
| 163 | ¿Qué es? | Descripción corta para reconocerlo. |
| 164 | ¿Qué hacemos con el abono? | Terminar antes: mantienes la cuota y reduces el plazo (ahorras más intereses). Pagar menos: mantienes el plazo y baja la cuota. |
| 165 | ¿Qué pagas? | Nombre del gasto fijo: arriendo, servicios, internet… |
| 166 | ¿Qué prefieres? | Elige la opción que más te convenga. |
| 167 | ¿Qué quieres lograr? | Nombre de tu meta: viaje, carro, fondo de emergencia… |
| 168 | ¿Qué se pagó? | Descripción del gasto compartido. |
| 169 | ¿Qué tan estricto es el consejero? | Más estricto: te advierte con más frecuencia antes de gastar o prestar. |
| 170 | ¿Qué tono quieres usar? | Cómo sonará el mensaje: amable, formal o directo. |
| 171 | ¿Tiene intereses? | Indica si el préstamo cobra intereses. Si es entre familia sin intereses, elige No. |
| 172 | Ícono | La imagen con la que reconocerás este elemento. |
| 173 | Últimos 2 dígitos de tu cédula | Pregunta de seguridad para recuperar tu cuenta. |

### 2.10 Tabla completa MDESC (24 entradas, literal)
| Modal (`M.tipo`) | Descripción |
|---|---|
| `aporte` | Un aporte fijo que te recordamos cada quincena o mes. |
| `fondo` | Tu fondo de emergencia: dinero guardado aparte solo para imprevistos. |
| `gasto` | Anota en qué se fue tu dinero. La categoría y si es gasto hormiga se detectan solos al escribir. |
| `contacto` | Guarda los datos de una persona o empresa con la que tienes préstamos, cobros o gastos compartidos. |
| `loan` | Registra un préstamo con su plan de cuotas. Calculamos cada pago, los intereses y te avisamos las fechas. |
| `pago` | Registra una cuota o un abono extra. Te mostramos cómo queda el saldo antes de guardar. |
| `ingreso` | Agrega el dinero que recibes con regularidad (salario, arriendos, honorarios). Es la base de tu presupuesto. |
| `activo` | Suma algo que tienes (cuentas, efectivo, bienes) o algo que debes, para calcular tu patrimonio real. |
| `inversion` | Registra un CDT, ahorro o inversión. Calculamos cuánto rinde y te avisamos cuando vence. |
| `meta` | Ponle nombre y valor a algo que quieres lograr. Te decimos cuánto ahorrar al mes para llegar a tiempo. |
| `sub` | Agrega un servicio que se cobra solo (streaming, apps, gimnasio) para tenerlo a la vista y evitar cobros olvidados. |
| `cal` | Fechas que llegan una vez al año (matrículas, impuestos, seguros) para que no te tomen por sorpresa. |
| `confirm` | Revisa antes de continuar. Podrás deshacerlo durante unos segundos. |
| `tarjeta` | Agrega tu tarjeta de crédito para controlar el cupo, la fecha de corte y la de pago. |
| `compraTC` | Registra una compra con tarjeta. Si es a cuotas, te mostramos cuánto te cuesta en intereses. |
| `cobro` | Prepara un recordatorio de cobro amable para enviar por WhatsApp o correo. |
| `gcal` | Lleva tus próximos pagos y cobros a tu Google Calendar para recibir avisos en el celular. |
| `grupo` | Crea un grupo para dividir gastos con otras personas: un viaje, la casa, un regalo. |
| `gastoGrupo` | Anota un gasto del grupo. Calculamos automáticamente cuánto le toca a cada uno y quién le debe a quién. |
| `extra` | Completa la información para continuar. |
| `libro` | Un libro es un espacio separado de finanzas (por ejemplo, el hogar y tu negocio) con sus propios datos. |
| `help` | Guía rápida de esta sección: para qué sirve y cómo usarla paso a paso. |
| `buscar` | Busca cualquier movimiento, persona, préstamo o sección. |
| `appNew` | Agrega un acceso directo a otra app que uses junto con Mirai. |

---

## 3. i_geo.js — Ciudades de Colombia y parseo de direcciones

### 3.1 Datos
- `GEO_RAW`: objeto `{departamento: 'Ciudad|Ciudad|…'}` — **33 entradas** (32 departamentos + Bogotá D.C.) y **243 municipios** (selección, **no** los 1.103 municipios del país).
- Nombres repetidos: **Barbosa** (Antioquia y Santander) y **La Unión** (Nariño y Valle del Cauca). En `GEO` el valor guardado `v` es "Ciudad, Departamento" para el repetido, **excepto** Barbosa-Antioquia y La Unión-Valle, que conservan solo el nombre. Lista ordenada por `localeCompare(…,'es')`.
- `GEO_TOP` (aparecen primero en el select): Bogotá, Medellín, Cali, Barranquilla, Cartagena, Bucaramanga, Pereira, Manizales, Cúcuta, Santa Marta, Ibagué, Villavicencio.
- `GEO_ALIAS` (clave normalizada → ciudad): `bogota d c`, `bogota dc`, `santafe de bogota`, `santa fe de bogota`, `bta`, `bogota` → Bogotá; `santiago de cali` → Cali; `cartagena de indias` → Cartagena; `villa de leiva` → Villa de Leyva; `san jose de cucuta` → Cúcuta; `mompos`, `santa cruz de mompox` → Mompox; `santiago de tolu` → Tolú; `puerto inirida` → Inírida.
- `GEO_ZONAS` (localidades/barrios conocidos por ciudad):
- **Bogotá** (39): Usaquén, Chapinero, Santa Fe, San Cristóbal, Usme, Tunjuelito, Bosa, Kennedy, Fontibón, Engativá, Suba, Barrios Unidos, Teusaquillo, Los Mártires, Antonio Nariño, Puente Aranda, La Candelaria, Rafael Uribe Uribe, Ciudad Bolívar, Cedritos, Chicó, Salitre, Modelia, Normandía, Galerías, Castilla, Hayuelos, Colina Campestre, Niza, Mazurén, Rosales, Chapinero Alto, Quinta Camacho, La Soledad, Palermo, Marsella, Timiza, Patio Bonito, Tintal
- **Medellín** (15): El Poblado, Laureles, Estadio, Belén, Robledo, Buenos Aires, La América, Manrique, Aranjuez, Castilla, Envigado centro, Las Palmas, Provenza, Manila, Conquistadores
- **Cali** (10): Granada, Ciudad Jardín, San Fernando, El Peñón, Chipichape, Santa Mónica, Pance, El Ingenio, Valle del Lili, Tequendama
- **Barranquilla** (7): El Prado, Alto Prado, Riomar, Villa Country, Buenavista, Ciudad Jardín, El Golf
- **Cartagena** (8): Bocagrande, Castillogrande, Manga, Getsemaní, Crespo, El Laguito, Pie de la Popa, Centro Histórico

Tabla de departamentos y municipios (literal):
| Departamento | # | Municipios |
|---|---|---|
| Amazonas | 2 | Leticia, Puerto Nariño |
| Antioquia | 35 | Medellín, Bello, Itagüí, Envigado, Sabaneta, La Estrella, Caldas, Copacabana, Girardota, Barbosa, Rionegro, La Ceja, Marinilla, El Carmen de Viboral, Guarne, El Retiro, Santa Fe de Antioquia, Apartadó, Turbo, Caucasia, Chigorodó, Carepa, Necoclí, Puerto Berrío, Yarumal, Andes, Jardín, Santa Rosa de Osos, Segovia, Sonsón, Guatapé, San Jerónimo, Amagá, Fredonia, Urrao |
| Arauca | 4 | Arauca, Saravena, Tame, Arauquita |
| Atlántico | 7 | Barranquilla, Soledad, Malambo, Puerto Colombia, Sabanalarga, Galapa, Baranoa |
| Bogotá D.C. | 1 | Bogotá |
| Bolívar | 6 | Cartagena, Magangué, Turbaco, Arjona, El Carmen de Bolívar, Mompox |
| Boyacá | 10 | Tunja, Duitama, Sogamoso, Chiquinquirá, Paipa, Villa de Leyva, Puerto Boyacá, Moniquirá, Nobsa, Garagoa |
| Caldas | 6 | Manizales, Villamaría, Chinchiná, La Dorada, Riosucio, Anserma |
| Caquetá | 2 | Florencia, San Vicente del Caguán |
| Casanare | 5 | Yopal, Aguazul, Villanueva, Paz de Ariporo, Tauramena |
| Cauca | 5 | Popayán, Santander de Quilichao, Puerto Tejada, Patía, Piendamó |
| Cesar | 6 | Valledupar, Aguachica, Agustín Codazzi, Bosconia, La Jagua de Ibirico, Curumaní |
| Chocó | 4 | Quibdó, Istmina, Bahía Solano, Nuquí |
| Córdoba | 7 | Montería, Cereté, Lorica, Sahagún, Montelíbano, Planeta Rica, Tierralta |
| Cundinamarca | 43 | Soacha, Chía, Zipaquirá, Facatativá, Fusagasugá, Mosquera, Madrid, Funza, Cajicá, Girardot, Sopó, La Calera, Tocancipá, Gachancipá, Cota, Tenjo, Tabio, Sibaté, Ubaté, Villeta, La Mesa, Anapoima, Ricaurte, Guaduas, Chocontá, Sesquilé, Guatavita, El Rosal, Subachoque, Silvania, Fómeque, Villapinzón, Pacho, Arbeláez, Nemocón, Cogua, Tocaima, Agua de Dios, Apulo, Choachí, Gachetá, Medina, Suesca |
| Guainía | 1 | Inírida |
| Guaviare | 1 | San José del Guaviare |
| Huila | 6 | Neiva, Pitalito, Garzón, La Plata, Campoalegre, San Agustín |
| La Guajira | 5 | Riohacha, Maicao, Uribia, San Juan del Cesar, Fonseca |
| Magdalena | 6 | Santa Marta, Ciénaga, Fundación, El Banco, Zona Bananera, Plato |
| Meta | 7 | Villavicencio, Acacías, Granada, Puerto López, Restrepo, Cumaral, Puerto Gaitán |
| Nariño | 5 | Pasto, Tumaco, Ipiales, Túquerres, La Unión |
| Norte de Santander | 7 | Cúcuta, Villa del Rosario, Los Patios, Ocaña, Pamplona, El Zulia, Tibú |
| Putumayo | 5 | Mocoa, Puerto Asís, Orito, Sibundoy, Valle del Guamuez |
| Quindío | 8 | Armenia, Calarcá, Montenegro, La Tebaida, Quimbaya, Circasia, Salento, Filandia |
| Risaralda | 4 | Pereira, Dosquebradas, Santa Rosa de Cabal, La Virginia |
| San Andrés y Providencia | 2 | San Andrés, Providencia |
| Santander | 11 | Bucaramanga, Floridablanca, Girón, Piedecuesta, Barrancabermeja, San Gil, Socorro, Málaga, Barbosa, Barichara, Lebrija |
| Sucre | 5 | Sincelejo, Corozal, Sampués, Tolú, Coveñas |
| Tolima | 8 | Ibagué, Espinal, Melgar, Honda, Mariquita, Chaparral, Líbano, Flandes |
| Valle del Cauca | 17 | Cali, Palmira, Buenaventura, Tuluá, Cartago, Buga, Jamundí, Yumbo, Candelaria, Florida, Pradera, El Cerrito, Sevilla, Zarzal, Roldanillo, Dagua, La Unión |
| Vaupés | 1 | Mitú |
| Vichada | 1 | Puerto Carreño |

**Cómo extraerla tal cual** (sin reescribir a mano), desde la raíz del repo:
```bash
node -e "const s=require('fs').readFileSync('src/i_geo.js','utf8');
const grab=n=>{const i=s.indexOf('const '+n+'=');const j=s.indexOf('{',i);let d=0,k=j;for(;k<s.length;k++){if(s[k]=='{')d++;else if(s[k]=='}'&&!--d)break}return eval('('+s.slice(j,k+1)+')')};
const out={raw:grab('GEO_RAW'),alias:grab('GEO_ALIAS'),zonas:grab('GEO_ZONAS')};
require('fs').writeFileSync('geo-colombia.json',JSON.stringify(out,null,2))"
```
`GEO_TOP` es un arreglo (copiar la línea). → Next: `lib/geo/colombia.json` + `lib/geo/index.ts` que construya `GEO` con la misma regla de duplicados (el valor `v` ya está guardado en datos existentes: **no cambiar el formato** o migrar). Considerar a futuro la lista DANE completa (DIVIPOLA) como tabla `municipios` en Supabase, manteniendo compatibilidad con los `v` actuales.

### 3.2 Helpers
- `cityOpts(extra)`: opciones `{v, l:ciudad, h:departamento, icon:'map-pin'}`, primero `GEO_TOP`, luego el resto; si `extra` no está, lo antepone con `h:'Otra ciudad'`.
- `geoOf(v)`: busca por `v` y luego por nombre.
- `GEO_IDX`: claves `FN(ciudad)` + alias, ordenadas por **longitud descendente** (prefiere "Santa Rosa de Cabal" a "Cabal"). `DEP_IDX`: `FN(departamento sin " D.C.")`, también por longitud.

### 3.3 Normalización `normAddr(s)` (reemplazos en orden, sin distinguir mayúsculas)
| Patrón | Resultado |
|---|---|
| `avenida carrera`, `av cra`, `ak` | `Av. Cra` |
| `avenida calle`, `av cl`, `ac` | `Av. Cl` |
| `carrera`, `carerra`, `cra`, `kra`, `kr`, `cr`, `crr` | `Cra` |
| `calle`, `cll`, `clle`, `cl` | `Cl` |
| `avenida`, `avda`, `av` (si no sigue Cra/Cl) | `Av.` |
| `transversal`, `trans`, `tv`, `tr` | `Tv` |
| `diagonal`, `diag`, `dg` | `Dg` |
| `circular`, `cir` | `Cir` |
| `apartamento`, `apto`, `apt`, `ap` | `Apto` |
| `interior`, `int` | `Int` |
| `torre`, `tor` | `Torre` |
| `oficina`, `of` | `Of.` |
| `número`, `numero`, `nro.`, `no.`, `n°`, `nº`, `#` | ` # ` |
| `15 - 20` | `15-20` |
| espacios antes de coma, comas dobles, espacios dobles | limpieza |
Al final recorta comas/espacios/guiones en los extremos.

### 3.4 Algoritmo `parseAddr(raw)` → `{ciudad, cityName, depto, barrio, dir}`
1. Si el texto tiene < 4 caracteres → `null`. Se normaliza (`FN`, comas separadas por espacios).
2. `lastDigit` = posición del último dígito (la ciudad/departamento normalmente va **después** del número).
3. **Departamento**: primer `DEP_IDX` que aparezca como palabra completa **después** del último dígito.
4. **Ciudad**: recorre todas las coincidencias de `GEO_IDX` como palabra completa; se descartan las que no están después del último dígito **ni** junto a una coma; se ignora si es la misma posición/nombre que el departamento. Puntaje = `2` (después del número) + `1` (junto a coma) + `3` (su departamento coincide con el detectado) + `largo/100`. Gana el mayor.
5. Si ciudad y departamento no concuerdan, busca la ciudad homónima del departamento detectado.
6. Si no hay ciudad y el departamento es Bogotá D.C. → Bogotá.
7. **Barrio** explícito: regex `\b(barrio|br.|b/|urbanización|urb.|conjunto|sector)\s+([^,#\d][^,#]*)` — se corta en `apto|torre|int|casa|piso`.
8. **Zona** (si no hay barrio y la ciudad tiene `GEO_ZONAS`): la zona más larga que aparezca como palabra completa.
9. Si no hay ciudad, ni barrio, ni zona: busca cualquier zona de > 5 letras en todas las ciudades y, si aparece, infiere la ciudad (ej. "Cedritos" → Bogotá).
10. **Dirección limpia**: elimina del texto original el fragmento del barrio, la ciudad (con tolerancia de tildes y sufijo "D.C."), sus alias de > 3 letras, el departamento, "Colombia" y la zona; el barrio también se limpia de esos nombres. Devuelve `normAddr(limpia)`.
11. `barrio` = barrio explícito o zona.

### 3.5 Respaldo con IA `aiAddr(raw)` (`modelTier:'quick'`)
Prompt literal:
```
Analiza esta dirección de Colombia escrita por un usuario: "{raw}".
Responde JSON {"direccion":"dirección normalizada al formato colombiano (Cl, Cra, Av., Tv, Dg, # 00-00, Apto) SIN ciudad ni barrio","barrio":"barrio o sector si se puede inferir, o vacío","ciudad":"municipio de Colombia o vacío si no se puede saber","departamento":"departamento o vacío","confianza":"alta|media|baja"}.
Si la dirección no menciona ciudad, NO la adivines: deja ciudad vacía.
```
La ciudad devuelta se cruza con `GEO` por `FN(nombre)` (y por los 5 primeros caracteres del departamento si viene); si no está, se usa el texto de la IA.

### 3.6 Integración en formularios
- Marcado `addrFields(prefijo, datos, {edit})`: campo **Dirección** (`data-addr="{p}ciudad"`, `data-addr-p`, `autocomplete="street-address"`, placeholder "Ej. Calle 80 # 15-20 apto 301, Chía") + chip `data-addr-chip` oculto; **Ciudad o municipio** (`sel` con búsqueda, `create:'city'`, "Busca tu ciudad"); **Barrio o sector** ("Ej. Cedritos"); `input hidden {p}depto`. Con `edit` (perfil) cada campo lleva `data-edit="perfil|campo"`. Lo usan Perfil (`c2_views.js`), contactos y "Alguien nuevo" en préstamos (`d_app.js`, prefijo `c_`).
- Eventos:
  - `input` en un campo `data-addr`: debounce **350 ms** → `parseAddr` → `addrApply(…,'local')` (rellena ciudad y depto; barrio solo si está vacío; muestra chip "Detectamos: **barrio, ciudad, depto**").
  - `focusout`: reemplaza el texto por la dirección normalizada si cambió y se detectó algo (o `dir` > 4 caracteres); aplica y **persiste** (en modo perfil escribe `S.perfil.ciudad/depto/barrio` y `commit()`). Si no hubo ciudad y el texto tiene > 8 caracteres: chip "Buscando la ciudad con IA…" → `aiAddr`; si la IA da ciudad, reemplaza dirección y muestra "La IA detectó: … · confírmalo" (si confianza ≠ alta); si no, "No identificamos la ciudad. Elígela en la lista."
- `setSelValue(scope, name, v, {l,h,icon,silent})`: pone el valor en un `sel()` (crea la opción si no existe, ícono `map-pin` para campos que terminan en `ciudad`), quita el estado de error y dispara `change` salvo `silent`.

→ Next: hook `useAddressParser()` con las funciones puras `normAddr/parseAddr` (100 % portables, con pruebas usando ejemplos: "calle 80 numero 15-20 apto 301 Chía", "Cra 7 # 72-41 barrio Chapinero Bogotá D.C."). IA vía `/api/ai`.

---

## 4. j_loans.js — Préstamos, pagos previos, OCR, empeños, suscripciones, imprevistos, fondo y aportes

### 4.0 Base que hay que conocer (b_core.js / d_app.js)
- **Préstamo** (en `S.cobrar` = "Me deben" o `S.pagar` = "Le debo"):
  `{id, concepto, monto, sistema:'frances'|'aleman'|'simple'|'americano'|'sin', tasa /* % mensual, 4 decimales */, frec:'mensual'|'quincenal'|'semanal'|'diario'|'diariohab', plazo, inicio:'YYYY-MM-DD', pagos:[{id, fecha, tipo:'cuota'|'abono', valor?, modo?:'plazo'|'cuota', imp?:1}], extra /* seguros por cuota, solo 'pagar' */, contactoId? /* cobrar */, acreedor?:{kind:'entidad'|'contacto', id} /* pagar */, prenda?:{obj, valor, limite, ref} }`.
- `SISTEMAS` (n = nombre simple, t = técnico): `frances` "Cuota fija" / "Sistema francés"; `aleman` "Cuota que va bajando" / "Abono fijo a capital (sistema alemán)"; `simple` "Interés sobre lo prestado" / "Interés simple"; `americano` "Solo intereses y al final el capital" / "Sistema americano"; `sin` "Sin intereses" / "Partes iguales" (con su descripción `d` e ícono).
- `FRECS`: mensual (k=1), quincenal (k=0,5; +15 días), semanal (k=12/52; +7 días), diario (k=12/365; +1 día), diariohab "Diario (lunes a sábado)" (k=12/313; salta domingos).
- **Tasa por periodo** `periodRate`: `im = tasa/100`; `sin` o 0 → 0; `simple` → `im·k`; resto → `(1+im)^k − 1`.
- **Motor `engine(L)`** (simulación cuota a cuota):
  - Francés: `int = S·i`; `cap = C − int` con `C = annuity(S,i,n) = S·i/(1−(1+i)^−n)` (o `S/n` si i=0); última cuota abona todo.
  - Alemán: `cap = monto/n` fijo; `int = S·i`.
  - Americano: `int = S·i`; `cap = 0` salvo última.
  - Simple: `int = base·i` (base = monto, o saldo tras abonos); `cap = monto/n`.
  - Sin: `cap = monto/n`.
  - `valor = int + cap + extra`.
  - Pagos ordenados por fecha: `cuota` consume la siguiente cuota; `abono` resta a capital; si `modo==='plazo'` (y sistema ≠ americano) recalcula el número de cuotas restantes (francés: `n = ceil(−ln(1 − S·i/C)/ln(1+i))`; otros: `ceil(S/capF)`), si no recalcula cuota (`C`, `capF`, `base`).
  - Devuelve `{i, sys, saldo, hist[], plan[] (máx. 1.200 filas), next, mora (días), vencidas[], k (cuotas pagadas), intPag, pagado, intTotal, totalPagar, done (saldo ≤ 0,5), progreso, extraFut}`. La fecha programada de la cuota n es `addPeriod(inicio, frec, n)`.
- `loanParams(form)`: `modoInt='no'` → `sistema='sin'`; `'tasa'` → si hay E.A. `tasa = ((1+EA)^(1/12) − 1)·100` (en `simple`: `EA/12`), si no la mensual escrita; `'cuota'` → sistema francés y `tasa = rateFromCuota()` (bisección 80 iteraciones sobre tasa mensual entre 0 y 100 %; 0 si `cuota·n ≤ monto`).
- `loanStatus(e)`: Pagado / "Atrasado n d" / "Cuota pronto" (si faltan ≤ `S.cfg.anticipo` días) / "Al día".

### 4.1 Detalle de préstamo (`loanDetail(cur, kind)`)
Devuelve piezas `{head, now, split, tiles, acts, e, ct, nm, isC, per}` que `c_views.js` arma como: `head + now + tiles + split + acts + pestañas`. Pestañas: **Plan de pagos** (`plan`), **Pagos recibidos/Pagos hechos** (`hist`, lista inversa con "Cuota n completa · interés + abono · quedó en" o "Abono a la deuda · para terminar antes / para bajar la cuota", y "Deshacer" solo en el último), **Datos del contacto** (`ct`, si hay contacto).
- **Encabezado**: avatar del contacto o ícono `landmark`; nombre (`loanName`); etiquetas: concepto, sistema (`SISTEMAS[].n`), frecuencia, tasa ("{x}% mensual" con hasta 2 decimales, o "sin intereses"); pill de estado. Con prenda: etiqueta violeta "Empeño" (ver 4.4).
- **Recuadro "ahora"** (`ld-now`):
  - Pagado: "¡Te pagó todo!" / "¡Deuda pagada!" + "Se recibieron/pagaron {pagado} en total."
  - Con vencidas (rojo): "Para ponerse al día {nombre} debe pagarte" / "Para ponerte al día debes pagar" **{suma de cuotas vencidas}**, "{n} cuota(s) vencida(s) · la primera venció el {fecha} (hace {mora} días)". Botones: "Llamar" (`tel:`; solo cobrar con teléfono) y "Registrar pago".
  - Si no: "Próximo pago que {nombre} te debe hacer" / "Tu próximo pago" **{valor}**, "Cuota n de N · fecha · es hoy | mañana | en d días"; color `warn` si faltan ≤ `S.cfg.anticipo` días, si no `info`. Botón "Registrar pago".
- **Reparto de la cuota** (primera vencida o próxima): barra apilada abono (verde `#3F7A1E` si cobrar, navy `#1F2B4B` si pagar) / interés (`#F2B233`) / seguros (`#9AA4B8`); texto "**{cap}** bajan la deuda y **{int}** son intereses (lo que ganas por prestar | el costo del crédito) y **{extra}** son seguros u otros cobros. Después de pagarla {nombre} quedará debiendo | quedarás debiendo **{saldo}**." Si cap = 0: "Nada baja la deuda todavía (solo intereses)".
- **Cifras (4 tarjetas)**: Prestaste/Te prestaron `monto` (fecha inicio) · Te debe hoy/Debes hoy `saldo` ("de capital, sin intereses futuros") · Te ha pagado/Has pagado `pagado` ("k de N cuotas") · Ganarás/Pagarás en intereses `intTotal` ("en total recibirás/pagarás {totalPagar}"). Barra de progreso `progreso` (verde cobrar, rojo `#E41E3F` pagar), "{%} de la deuda pagada", "Termina el {fecha última}" / "Terminado".
- **Acciones**: "Enviar recordatorio" (modal `cobro`, solo cobrar no pagado) · "Simular abono" (va a `estrategia`, solo pagar) · "Acuerdo de pago (PDF)" (`acuerdo`, solo con contacto) · eliminar (`delLoan`).

### 4.2 Plan de pagos (`loanPlanTab`)
- Guía plegable "¿Cómo leer este plan de pagos?" (abierta hasta que el usuario la cierra; se recuerda en `store['lmf-how-plan']`): ecuación "Valor de la cuota = Abono a la deuda + Interés (+ Seguros)" y viñetas (Abono, Interés "Al principio es más alto porque se calcula sobre lo que falta.", Queda debiendo, filas Vencida).
- **Gráfica `loanBars`** (SVG 640×150): una barra por cuota (pagadas desde `hist` + pendientes desde `plan`); si hay > 60, agrupa de a `ceil(n/60)`. Apilado abono/interés/seguros con los colores de 4.1; pagadas con opacidad 0,45; marca inferior roja `#E5484D` si vencida, azul `#2F6FED` si es la siguiente. `<title>` por barra: "Cuota(s) n–m · fecha: total (interés + abono + seguros) · pagada|vencida". Leyenda y fechas extremas.
- **Tabla**: # · Fecha de pago (+ "hace d días" si vencida) · Valor de la cuota (con mini barra) · Abono a la deuda · Interés · [Seguros] · Queda debiendo · Estado (Pagada / Vencida / Siguiente / Pendiente). Si hay > 14 filas y no se pidió todo, muestra desde 2 antes de la primera abierta hasta 10 después; botón "Ver las {N} cuotas" / "Ver menos" (`LPLAN_ALL`, acción `lplanAll`).
- Regla de "Siguiente": índice 0 del plan o el índice igual al número de vencidas.

### 4.3 Préstamos que ya venían de antes (pagos previos)
Paso del modal `loan` "¿Ya te ha pagado algo? / ¿Ya has pagado algo?" ("Si el préstamo empezó antes de usar Mirai, no tienes que registrar cada pago uno por uno.") con `hist`:
| Opción | Texto | Cálculo (`histPlan`) |
|---|---|---|
| `nuevo` | "No, es nuevo" | Nada. |
| `aldia` | "Va al día" — "Marcamos como pagadas todas las cuotas cuya fecha ya pasó." | Una `cuota` por cada fila del plan con fecha ≤ hoy, con su fecha. |
| `cuotas` | "Ya se pagaron algunas cuotas" — campo "¿Cuántas cuotas ya se pagaron?" (`ncuotasPag`) | Las primeras `n` (acotado a 0…plazo); fecha = la de la cuota o hoy si es futura. |
| `saldo` | "Sé cuánto se debe hoy" — campos "¿Cuánto te debe hoy? / ¿Cuánto debes hoy?" (`saldoHoy`) y "Fecha del último pago" (`fultPago`) | Marca cuotas mientras el saldo después de la cuota siga ≥ saldo objetivo − 0,5 (fecha = la menor entre la cuota y el último pago; tope 1.200). Si queda diferencia > $1 entre el saldo simulado y el escrito, agrega un `abono` por la diferencia con `modo:'plazo'` en la fecha del último pago. |
Todos los pagos generados llevan `imp:1`.
- **Vista previa** `#lhp`: sin monto → "Primero escribe el valor y las cuotas del préstamo."; `saldo` sin valor → "Escribe el saldo que aparece en el extracto o el que te dijeron."; saldo > monto → "El saldo de hoy es mayor que el valor prestado. Revisa los valores."; si no: "Así quedará registrado" **"Te debe / Debes {saldo}"** + "n cuotas pagadas + un abono de X para cuadrar el saldo · total recibido/pagado **X**. ¡Quedaría saldado! | Faltan **n** cuotas de X, **n vencidas**."
- Al guardar (`applyLoanHist`, envuelto para aplicar primero la prenda): agrega los pagos y devuelve "Registramos n cuota(s) ya pagada(s) [y un abono para cuadrar el saldo]. Saldo actual: X." (o "No había cuotas para marcar como pagadas.") que se concatena al toast "Préstamo registrado." / "Deuda registrada.".

### 4.4 Modal `loan` completo (d_app.js, para reimplementar el formulario)
Título "Registrar un préstamo que hiciste" (cobrar) / "Registrar una deuda" (pagar); ancho.
0. **Caja OCR**: "¿Tienes el extracto, pagaré o factura del crédito?" — "Tómale una foto o súbela y la IA llena los datos: a quién | la entidad, valor, cuotas, tasa y lo que ya se ha pagado." Botón "Leer con foto" (`#fotoLoan`, `image/*,application/pdf`, `capture=environment`).
1. **¿A quién le prestaste? / ¿Quién te prestó?** — cobrar: Un contacto guardado (`ex`) / Alguien nuevo (`new`); pagar: Banco o entidad (`ent`, select con `create:'ent'`) / Un contacto / Alguien nuevo. "Alguien nuevo" = campos de contacto con prefijo `c_` (nombre, tipo y número de documento, teléfono, correo, dirección/ciudad/barrio, relación).
2. **¿Cuánto y cómo se paga?** — ¿Cuánto prestaste?/¿Cuánto te prestaron? (req) · ¿Para qué fue? (`concepto`) · Fecha del préstamo · ¿Cada cuánto se paga? · ¿En cuántas cuotas? (chips 1,3,6,12,24,36,48 o, si diario, 20,30,45,60,90,120) · solo pagar: "Seguros y otros cobros por cuota" (tip "Los bancos suelen sumar a la cuota un seguro de vida o de deudor. Míralo en tu extracto. Si no sabes, déjalo vacío.").
3. **¿Cobra intereses?** — No (`no`, por defecto en cobrar) / Sí, sé el porcentaje (`tasa`, por defecto en pagar): "Interés mensual (%)" (hint "Si te dijeron "al 2%", escribe 2.") y "¿O te dieron una tasa anual (E.A.)?" / Sí, sé cuánto es la cuota (`cuota`): "Valor de cada cuota".
4. **¿Cómo se calcula la cuota?** (solo con `tasa`): los 4 sistemas (francés recomendado).
- Vista previa `#lp` (en `updatePreviews` de d_app).
- **Empeño/garantía**: "¿Te dejaron algo en garantía (empeño)? / ¿Dejaste algo en garantía (empeño)?" No/Sí → ¿Qué te dejaron?/¿Qué empeñaste? (`prObj`), ¿Cuánto vale aproximadamente? (`prValor`), Fecha límite para recuperarlo (`prLimite`, por defecto hoy + 4 meses si es empeño, + 12 si no), Número de contrato o boleta (`prRef`).
- **Pagos previos** (4.3).
- Validaciones al guardar: "Escribe el valor del préstamo", "Escribe el valor de la cuota" (modo cuota), "Escribe el nombre de la persona", "Elige un contacto", "Elige el banco o entidad". Tras guardar navega a `#me-deben` / `#le-debo` y selecciona el préstamo.

### 4.5 Empeños
- `applyPrenda(L, f)`: si `prenda==='si'` → `L.prenda = {obj: prObj || 'Objeto en garantía', valor, limite, ref}`; si no hay concepto usa el objeto.
- **Acción `empeno`** ("Registrar empeño" en Le debo): abre `loan` con `kind:'pagar', empeno:1` y fuerza `modoInt='tasa'` y `sistema='americano'` (solo intereses).
- **Caja `prendaBox`** (va antes del recuadro "ahora"): título "Garantía que te dejaron: X" / "Objeto empeñado: X"; "Vale aprox. X · Boleta Y ·" + mensaje según nivel:
  - pagado (`ok`): "El préstamo está pagado: ya debes devolver el objeto." / "Ya pagaste todo: puedes recoger tu objeto."
  - sin fecha: "Sin fecha límite registrada."
  - vencido (`bad`): "La fecha límite pasó hace d días." (+ en pagar "Comunícate ya con la casa de empeño: podrías perder el objeto.")
  - ≤ 15 días `warn`, si no `info`: "Quedan **d días** (hasta el F)." + en pagar "Para recuperarlo debes pagar {saldo}[ o al menos los intereses para refrendar (extender el plazo)]" (lo último si sistema americano y quedan cuotas).
- **Notificaciones** (envuelve `notifs()`): por cada préstamo no pagado con prenda y límite a ≤ 15 días: id `pr:{id}:{limite}`, nivel `bad` (vencido) o `warn`, ícono `gem`; títulos "Venció el plazo del empeño: X" / "Recupera tu empeño: X" (pagar) / "Plazo de la garantía: X" (cobrar); cuerpo "La fecha límite fue el F." / "Quedan d días (hasta el F). Saldo: X."; va a `me-deben`/`le-debo`. Orden final: bad, warn, info, ok y luego fecha.

### 4.6 OCR con IA
Condiciones: `S.cfg.ia.ocr!==false` y capacidad `sample`; si no, `iaMsg()`. Si `sample.limits().images` es falso: "Esta vista no permite enviar imágenes a la IA." `modelTier:'default'`, imagen adjunta.

**Extracto/pagaré (`ocrLoan`)** — "Leyendo el documento…". Prompt literal:
```
Lee este documento colombiano de un crédito o préstamo (extracto bancario, pagaré, contrato, factura a cuotas, recibo o tabla de amortización). {El usuario es quien PRESTÓ el dinero. | El usuario es quien DEBE el dinero.}
Responde SOLO JSON con esta forma (usa null si un dato no aparece; valores en pesos sin puntos):
{"tipo_documento":"extracto|pagare|contrato|factura|recibo_pago|tabla|otro","acreedor":"banco, entidad o persona que prestó","acreedor_nit":"NIT o documento sin dígito de verificación","acreedor_es_persona":false,"deudor":"nombre de quien debe","deudor_documento":"cédula","concepto":"producto o motivo (ej. Crédito libre inversión, Televisor)","monto":0,"fecha_inicio":"YYYY-MM-DD","frecuencia":"mensual|quincenal|semanal|diario","plazo_cuotas":0,"valor_cuota":0,"tasa_mensual":0,"tasa_ea":0,"seguros_por_cuota":0,"cuotas_pagadas":0,"saldo_actual":0,"fecha_ultimo_pago":"YYYY-MM-DD","pago_valor":0,"pago_fecha":"YYYY-MM-DD"}
"tasa_mensual" es el % mes vencido (ej. 1.85). "tasa_ea" el % efectivo anual. "saldo_actual" es el saldo de capital que falta pagar.
```
Mapeo a campos:
- Deuda con acreedor no persona: busca entidad por NIT, por `FN(nombre)` o si el nombre leído contiene el de una entidad (> 4 letras); si no existe **la crea** (`tipo:'Banco'`) y lo informa ("creamos la entidad "X""); selecciona `quien='ent'`.
- Si no: contacto por nombre exacto normalizado (`ex`) o "Alguien nuevo" con nombre y documento.
- `monto`, `concepto`, `fecha_inicio` (si formato ISO), `frecuencia` (si existe en FRECS), `plazo_cuotas`, `seguros_por_cuota` → `extra`.
- Tasa: si hay `tasa_mensual` o `tasa_ea` → modo `tasa` (prefiere mensual; usa coma decimal); si no, con `valor_cuota` → modo `cuota`.
- Pagado: si `saldo_actual` < monto → `hist='saldo'` + `saldoHoy` + `fultPago`; si no, con `cuotas_pagadas` → `hist='cuotas'`.
- Mensaje final: "Leímos: **{lista}**. Revisa los datos antes de guardar." (+ si `recibo_pago`: "Parece un comprobante de pago: después de guardar la deuda, regístralo en "Registrar pago".") o "No encontramos datos del crédito en el documento. Escríbelos a mano." Errores: "No pude leer el documento. Intenta con una foto más clara o escribe los datos." / "No pude leer el documento."

**Comprobante de pago (`ocrPago`)** — "Leyendo el comprobante…". Prompt literal:
```
Lee este comprobante de pago colombiano (transferencia, consignación, recibo de caja, pago PSE o Nequi/Daviplata). Responde SOLO JSON {"valor":0,"fecha":"YYYY-MM-DD","referencia":"","pagador":"","beneficiario":""}. "valor" en pesos sin puntos; null si no aparece.
```
Regla: `n = round(valor / próximaCuota)`; si `n ≥ 1` y `|valor − n·cuota| ≤ max(1000, 1 % de la cuota)` → tipo `cuota` con `ncuotas=n` ("Pago de X del F: coincide con n cuota(s) completa(s)."); si no → `abono` con el valor ("…No coincide con la cuota (X), así que lo registramos como abono. Puedes cambiarlo."). Errores: "No pude leer el comprobante. Escribe el valor a mano." / "No encontramos el valor en el comprobante."

Modal `pago` (d_app.js, contexto): caja "¿Tienes el comprobante?" + "Leer comprobante"; resumen "Te debe/Debes X · próxima cuota X el F"; tipo "Pagó/Pagué la cuota completa" (X · cuota n) o "Hizo/Hice un abono" ("Cualquier otro valor que va directo a la deuda."); "¿Cuántas cuotas?" (chips 1–3 hasta las restantes) o "¿Cuánto?"; "Fecha del pago"; si no es americano, "¿Qué hacemos con el abono?" Terminar de pagar antes (`plazo`) / Que la cuota baje (`cuota`); vista previa `#pp`.

→ Next: Route Handler `/api/ai/ocr` (multimodal) con los mismos prompts y validación con `zod`; subir imagen a Supabase Storage solo si se decide guardar soporte.

### 4.7 Suscripciones
- `SUBQ` (accesos rápidos, nombre + color de fondo de la inicial; **sin logos de marca**): Netflix `#E50914`, Disney+ `#113CCF`, Max `#5822B4`, Prime Video `#00A8E1`, Spotify `#1DB954`, YouTube Premium `#FF0033`, Apple TV+ `#111111`, Paramount+ `#0064FF`, Crunchyroll `#F47521`, Apple Music `#FA243C`, iCloud `#3693F3`, Google One `#4285F4`, Xbox Game Pass `#107C10`, PlayStation Plus `#003791`, ChatGPT Plus `#10A37F`, Claude Pro `#D97757`, Microsoft 365 `#D83B01`, Gimnasio `#3F7A1E`.
- `subAv(nombre, logo)`: imagen propia si existe; si no, círculo con la inicial y el color del servicio que coincida (exacto o prefijo normalizado), por defecto `#6E56CF`.
- Clic en un acceso (`data-subname`) llena "Servicio", marca el botón y enfoca "Valor".
- Logo propio (`#subLogo`): se recorta al centro a un cuadrado y se reduce a **72×72 PNG** (data URL) en `logo`; vista previa `#subLogoPrev`. Sin logo, la vista previa cambia color e inicial al escribir.
- Modal `sub` (d_app.js): "Nueva suscripción" / "Streaming, música, apps, nube o gimnasio: todo lo que se cobra solo cada mes o cada año. Te avisamos antes de cada cobro para que decidas si la sigues pagando." Campos: accesos rápidos, Servicio (req), Valor (con decimales), Moneda (COP por defecto), ¿Cada cuánto? (Mensual/Anual), Próximo cobro (hoy + 15 días), ¿Con qué se paga? (primer medio con "crédito"), Logo (opcional), ¿La compartes? (No / entre 2–5). Guarda `{id, nombre, valor, ciclo, proximo, moneda, medio, comparte, logo}` en `S.suscripciones`; toast "{nombre} guardada. Te avisaremos antes del cobro del {fecha}."
→ Next: logo a Supabase Storage (o seguir como data URL pequeño en la fila).

### 4.8 Imprevistos y fondo de emergencia
- Estado `S.fondo = {on:false, saldo:0, mov:[{id, tipo:'guardar'|'usar', valor, fecha, nota, gid?}]}` (creado en `normalize`); la categoría **Imprevistos** (`grupo n`, ícono `siren`) se agrega siempre.
- **`imprevBox()`** dentro del modal `gasto`, visible solo si `cat == Imprevistos` (`data-show="cat:Imprevistos"`; `applyShows` se re-ejecuta 700 ms después de escribir en el formulario de gasto, porque la categoría se pone sola): "Es un imprevisto" + switch marcado "Pagarlo con mi fondo de emergencia (tienes X)" si hay saldo; si no: "Queda separado en tus reportes como imprevisto. Para la próxima, crea un fondo de emergencia en Metas y págalo desde ahí."
  - Al guardar el gasto con `usarFondo` (d_app.js): `v = min(valor, saldo)`, `g.fondo = v`, resta del fondo, movimiento `usar` con `gid`; toast "Gasto registrado y pagado con tu fondo de emergencia. Te quedan X en el fondo." Al **borrar** ese gasto, se devuelve `fondo` al saldo y se quita el movimiento.
- **`fondoBlock()`** (en Metas, `c2_views.js`): título "Tu bolsillo de emergencias" / "Separa un bolsillo para imprevistos" con su texto; botones "Guardar dinero" y (si hay saldo) "Usar para un imprevisto"; fila de **aporte programado** con sugerencia `ceil(gastosBasicos()·0,10 / 1000)·1000`; métricas "Imprevistos este mes" y "Imprevistos en {año}" (suma de gastos categoría Imprevistos); últimos 6 movimientos (más reciente primero) con "+"/"−".
- **Modal `fondo`** (`data-tipo` guardar/usar):
  - Guardar — "Guardar en el fondo de emergencia" / "Anota el dinero que separas para emergencias (por ejemplo, lo que pasas a un bolsillo de Nequi o a una cuenta de ahorros aparte)." Campos: ¿Cuánto guardas? (req), Fecha, ¿Dónde lo guardas? (nota). Nota "Meta recomendada: {S.cfg.emergMeta} meses de tus gastos básicos ({gastosBasicos()·emergMeta})." Efecto: `on=true`, suma saldo, movimiento; toast "Guardaste X. Tu fondo tiene Y." (título "Fondo de emergencia").
  - Usar — "Usar el fondo para un imprevisto" / "Registra en qué usaste el fondo. Queda como gasto en la categoría Imprevistos y se descuenta del fondo." Campos: ¿Qué pasó? (req), ¿Cuánto costó? (hint "Tienes X en el fondo."), Fecha, ¿Cómo lo pagaste?. Efecto: crea gasto `{cat:'Imprevistos', quien:'familia', fondo:v, hormiga:false, hormigaSrc:'manual'}` por el valor total; `v = min(valor, saldo)` sale del fondo; toast "El fondo cubrió X; los otros Y salieron de tu dinero del día a día." (warn) o "Pagado con el fondo. Te quedan X." (título "Imprevisto registrado").
  - Validación: "Escribe el valor".

### 4.9 Aportes programados (fondo y metas)
- Enlace `link = {t:'fondo'} | {t:'meta', id}`; clave `fondo` o `meta:{id}`. Un aporte es un **gasto fijo** en `S.fijos` con `link`.
- `payDays()`: toma el ingreso quincenal, o el que parezca salario (`salario|sueldo|nómina`), o el primero. Quincenal → días 15 y 30, texto "cada quincena (15 y 30), cuando te pagan"; mensual → día del ingreso (o 30), "cada mes el día N, cuando te pagan". Sin ingresos → mensual día 30.
- **`aporteRow(link, sugerencia)`**: si existe → "Aporte programado: X cada quincena|cada mes", "Pendiente desde F" (si vencido) o "Próximo: F", "llevas n aportes", botón "Ya aporté" (abre `pagarFijo` con el periodo) y lápiz (editar). Si no existe → botón "Programar un aporte fijo" — "Te lo recordamos {payDays().txt} y queda en tus gastos fijos para que no se te olvide."
- **Modal `aporte`**: "Programar aporte fijo" / "Editar aporte programado"; descripción "Define cuánto vas a guardar en tu {fondo de emergencia | meta "X"} cada vez que recibas dinero. Queda como gasto fijo: te recordamos la fecha y, al marcarlo como hecho, se suma solo." Campos: ¿Cuánto vas a guardar cada vez? (req; sugerido = valor actual, o `ceil(base[/2 si quincenal]/1000)·1000` con base = sugerencia o 10 % de gastos básicos para el fondo), ¿Cada cuánto? (Cada quincena/Cada mes), Día de la 1ª quincena, Día de la 2ª quincena, Día del mes. Nota: "Pusimos los días en que recibes tu ingreso (…). Lo ideal es apartarlo apenas te paguen, antes de gastar." + para metas "Para llegar a tiempo a tu meta necesitas guardar unos X al mes (Y por quincena)." Pie: "Quitar aporte" (si existe), "Cancelar", "Programar aporte"/"Guardar cambios".
- **Guardar** (`EXTRA_FORM.aporte`): "Escribe cuánto vas a guardar" si falta. Gasto fijo: `{nombre:'Aporte a fondo de emergencia' | 'Aporte a meta: X', cat:'Ahorro', valor, frec, dia (quincenal: 1–15, por defecto 15; mensual: 1–31, por defecto 30), dia2 (16–31, por defecto 30), variable:false, medio:'Transferencia', proveedor:'Yo mismo', link}`. Nuevo: `desde = mes actual`, `inicio = hoy`, `pagos=[]`. Editando: si cambia frecuencia o días, reinicia `desde`/`inicio`. Para el fondo pone `on=true`. Toast "Guardarás X cada quincena|cada mes en tu …. Primer recordatorio: F. También lo verás en Gastos fijos." (título "Aporte programado"/"Aporte actualizado").
- **Quitar** (`aporteDel`): borra el fijo con "Deshacer"; "El aporte programado se quitó. Lo que ya ahorraste se mantiene."
- **`aporteApply(fijo, valor, fecha, gid)`** (al marcar el fijo pagado en d_app.js): marca el gasto con `aporte:{t,id,v}`; fondo → suma saldo y movimiento "Aporte programado" ("¡Bien! Guardaste X. Tu fondo de emergencia tiene Y."); meta → `ahorrado += valor` ("¡Bien! Sumaste X a "M". Llevas Y de Z (P%).").
- **`aporteRevert(gasto)`** (al borrar ese gasto): resta del fondo (mín. 0) y quita el movimiento, o resta de la meta (mín. 0); quita el pago del periodo en el fijo.

→ Next (préstamos y ahorro): el motor `engine`, `histPlan`, `rateFromCuota`, `loanParams`, reglas de OCR y de empeño son **lógica pura** → `lib/loans/*.ts` con pruebas de regresión (comparar contra el motor actual con los datos de `sample()`). Tablas sugeridas: `loans(kind cobrar|pagar, …)`, `loan_payments`, `loan_collateral` (o JSON `prenda`), `emergency_fund` + `emergency_fund_movements`, `subscriptions`, `fixed_expenses` con `link_type/link_id`. Las relaciones gasto↔fondo/aporte deben ser **transaccionales** (RPC de Postgres) para que borrar/deshacer no deje saldos inconsistentes.

---

## 5. k_ayuda.js — Versión, novedades, FAQ y manual

### 5.1 Estructuras
- `APP_VER = '4.0'`.
- `RELEASES`: arreglo de la más nueva a la más antigua: `{v, f /* fecha en texto */, t /* título */, items:[[tipo, título, descripción], …]}` con `tipo ∈ new | imp | fix`.
- `RTYPE`: `new` → ["Nuevo", pill `ok`, ícono `sparkles`]; `imp` → ["Mejora", `info`, `trending-up`]; `fix` → ["Corrección", `warn`, `wrench`].
- `FAQ`: `{c /* categoría */, q, a /* HTML con <b> */, go? /* vista */, tab? /* pestaña de Ajustes */}`.
- `GUIDES`: `{id, t, icon /* lucide */, go, tab?, min /* minutos */, s:[pasos], tip?}`.
- El "Manual por sección" **no** está en este archivo: se arma con `MENUPAGES()` × `HELP[id]` (`{t, i, p:[pasos HTML], tips?}`), que vive sobre todo en `f_extra.js` y otros módulos. Este archivo solo agrega `HELP.novedades`, `HELP.faq`, `HELP.manual`.

**Los textos se migrarán tal cual desde el archivo** (no se copian aquí). Script de extracción a JSON:
```bash
node -e "const s=require('fs').readFileSync('src/k_ayuda.js','utf8');
const arr=(a,b)=>eval('('+s.slice(s.indexOf('[',s.indexOf(a)),s.indexOf(b)).trim().replace(/;$/,'')+')');
const out={APP_VER:s.match(/APP_VER='([^']+)'/)[1],RELEASES:arr('const RELEASES','const RTYPE'),FAQ:arr('const FAQ=','const GUIDES'),GUIDES:arr('const GUIDES=','let AYQ')};
require('fs').writeFileSync('ayuda.json',JSON.stringify(out,null,2))"
```

### 5.2 RELEASES (resumen; 11 versiones)
| Versión | Fecha | Título | Nuevo | Mejora | Corrección | Total |
|---|---|---|---|---|---|---|
| 4.0 | 31 oct 2026 | Nuevo menú DIAN y acceso para tu contador | 5 | 2 | 0 | 7 |
| 3.9 | 31 oct 2026 | Logros, integraciones en tu servidor y pantalla más limpia | 4 | 2 | 0 | 6 |
| 3.8 | 31 oct 2026 | Calendarios renovados | 4 | 3 | 0 | 7 |
| 3.7 | 31 oct 2026 | Asesor financiero, nuevo diseño y servidor propio | 5 | 1 | 0 | 6 |
| 3.6 | 31 oct 2026 | Ajustes renovados, IA a tu medida y descuentos de nómina | 7 | 1 | 0 | 8 |
| 3.5 | 31 oct 2026 | Ahorro automático en tu calendario | 2 | 2 | 0 | 4 |
| 3.4 | 31 oct 2026 | Imprevistos, empeños y préstamos que ya venían de antes | 8 | 2 | 0 | 10 |
| 3.3 | 31 oct 2026 | Formularios más simples e inteligentes | 9 | 2 | 1 | 12 |
| 3.0 | Oct 2026 | Nace Mirai | 4 | 1 | 0 | 5 |
| 2.0 | Oct 2026 | Más módulos y guía de uso | 9 | 2 | 0 | 11 |
| 1.0 | Oct 2026 | Primera versión | 8 | 0 | 0 | 8 |

### 5.3 FAQ (40 preguntas en 10 categorías)
Conteo: Préstamos y deudas 7 · Gastos 6 · Inteligencia artificial 5 · Cuenta y seguridad 5 · Primeros pasos 4 · DIAN 3 · Ahorro 3 · Otros 3 · Logros 2 · Notificaciones 2. Orden de categorías en los filtros = orden de primera aparición (DIAN, Logros, Notificaciones, Primeros pasos, Inteligencia artificial, Cuenta y seguridad, Gastos, Préstamos y deudas, Ahorro, Otros).
| # | Categoría | Pregunta | `go` | `tab` |
|---|---|---|---|---|
| 1 | DIAN | ¿Cómo le doy acceso a mi contador? | contador |  |
| 2 | DIAN | ¿Mis hijos me ayudan a pagar menos renta? | renta |  |
| 3 | DIAN | ¿Para qué registro mis bienes? | renta |  |
| 4 | Logros | ¿Cómo gano puntos y subo de nivel? | logros |  |
| 5 | Logros | ¿Puedo quitar los logros? | logros |  |
| 6 | Notificaciones | ¿Qué servicio de correo uso: Gmail, SendGrid, Resend o SMTP? | ajustes |  |
| 7 | Notificaciones | ¿Dónde quedan guardadas mis claves? | ajustes |  |
| 8 | Primeros pasos | ¿Por dónde empiezo? | puesta |  |
| 9 | Primeros pasos | Ya tenía deudas y préstamos pagados en parte, ¿debo registrar cada pago? | le-debo |  |
| 10 | Primeros pasos | ¿Puedo usar Mirai en el celular? |  |  |
| 11 | Primeros pasos | ¿Escribo mi salario completo o lo que me llega? | ingresos |  |
| 12 | Inteligencia artificial | ¿Puedo apagar la IA o usar ChatGPT o Gemini? | ajustes | ia |
| 13 | Cuenta y seguridad | ¿Me pueden llegar los avisos por correo o WhatsApp? | ajustes | alertas |
| 14 | Inteligencia artificial | ¿Cómo uso el asesor financiero? | consejero |  |
| 15 | Gastos | ¿Cuál es la diferencia entre gasto, gasto fijo y deuda? |  |  |
| 16 | Gastos | ¿Qué es un gasto hormiga? | gastos |  |
| 17 | Gastos | Los servicios no cuestan lo mismo cada mes, ¿cómo los registro? | fijos |  |
| 18 | Gastos | Mi recibo del agua aparece vencido pero este mes no tocaba pagar | fijos |  |
| 19 | Gastos | ¿Cómo registro un imprevisto? | metas |  |
| 20 | Gastos | No encuentro mi categoría |  |  |
| 21 | Préstamos y deudas | No entiendo la tabla de cuotas | me-deben |  |
| 22 | Préstamos y deudas | ¿Qué significa "1% mensual" y "E.A."? |  |  |
| 23 | Préstamos y deudas | ¿Qué sistema de cuota elijo? |  |  |
| 24 | Préstamos y deudas | ¿Cómo registro algo que empeñé? | le-debo |  |
| 25 | Préstamos y deudas | Me pagaron un valor diferente a la cuota, ¿qué hago? |  |  |
| 26 | Préstamos y deudas | ¿Puedo registrar préstamos que se cobran todos los días? |  |  |
| 27 | Préstamos y deudas | El banco no está en la lista |  |  |
| 28 | Ahorro | ¿Qué es el fondo de emergencia y cuánto debo tener? | metas |  |
| 29 | Ahorro | ¿Cómo hago para no olvidar ahorrar cada quincena? | metas |  |
| 30 | Ahorro | ¿Cómo registro mis suscripciones de streaming? | suscripciones |  |
| 31 | Inteligencia artificial | ¿Qué hace la IA en Mirai? |  |  |
| 32 | Inteligencia artificial | ¿Puedo confiar en lo que llena la IA? |  |  |
| 33 | Inteligencia artificial | La lectura con foto no funciona |  |  |
| 34 | Cuenta y seguridad | ¿Cómo protejo mi información? | ajustes | seguridad |
| 35 | Cuenta y seguridad | Perdí el celular con la app de autenticación |  |  |
| 36 | Cuenta y seguridad | ¿Dónde se guardan mis datos? |  |  |
| 37 | Cuenta y seguridad | ¿Cómo borro todo o elimino mi cuenta? | ajustes |  |
| 38 | Otros | ¿Puedo llevar las finanzas de mi negocio aparte? |  |  |
| 39 | Otros | ¿Cómo comparto gastos con otras personas? | compartidos |  |
| 40 | Otros | ¿Cómo vuelvo a ver el tour? | manual |  |

### 5.4 GUIDES (10 instructivos)
| id | Título | Ícono | `go` | `tab` | min | Pasos | Tip |
|---|---|---|---|---|---|---|---|
| g1 | Registrar tu primer gasto | receipt | gastos |  | 1 | 4 | sí |
| g2 | Registrar una deuda que ya venías pagando | landmark | le-debo |  | 3 | 6 | sí |
| g3 | Registrar un pago recibido o hecho | circle-dollar-sign | me-deben |  | 1 | 4 | sí |
| g4 | Registrar un empeño | gem | le-debo |  | 2 | 5 | — |
| g5 | Agregar los servicios públicos | zap | fijos |  | 2 | 5 | — |
| g6 | Crear tu fondo de emergencia | umbrella | metas |  | 1 | 5 | — |
| g7 | Agregar una suscripción de streaming | repeat | suscripciones |  | 1 | 4 | — |
| g8 | Proteger tu cuenta con verificación en dos pasos | shield-check | ajustes | seguridad | 3 | 5 | — |
| g9 | Dividir gastos con amigos o familia | split | compartidos |  | 2 | 4 | — |
| g10 | Preguntarle al consejero antes de gastar | sparkles | consejero |  | 1 | 4 | — |

### 5.5 Vistas
- **`V.novedades`** — cabecera `megaphone` "Novedades" / "Todo lo que hemos agregado y mejorado en Mirai, de lo más nuevo a lo más antiguo."; tarjeta destacada con isotipo, pill "Versión {APP_VER}", título de `RELEASES[0]` y "{n} novedades · {fecha}"; una tarjeta por versión con "v{v}", título, fecha ("· actual" en la primera), contadores por tipo ("n nuevos", "n mejoras", "n correcciones") y lista con ícono, título, descripción y pill. Al abrirla guarda `store['mirai-nov-seen']=APP_VER` (400 ms después) y repinta el menú.
- **Indicador en el menú** (envuelve `renderNav`): si `mirai-nov-seen ≠ APP_VER`, agrega insignia "Nuevo" al enlace `#novedades` y un punto al grupo `ayuda`.
- **`V.faq`** — cabecera `circle-help` "Preguntas frecuentes" / "Respuestas cortas a las dudas más comunes. Busca o filtra por tema."; buscador (`#ayQ`, "Busca tu duda: empeño, intereses, contraseña…") que filtra sobre `FN(q + a sin HTML)`; chips de categoría con conteo (`Todas` + categorías); acordeón (`details`) con las 3 primeras abiertas cuando hay búsqueda; respuesta + botón "Ir a la sección" (`data-go`, `data-tab`); vacío: "No encontramos "X". Prueba con otra palabra o revisa el Manual." + "Ir al manual"; pie "¿No encontraste tu respuesta?" con "Manual" y "Consejero IA".
- **`V.manual`** — cabecera `book-open` "Manual e instructivos" / "Aprende a usar Mirai: guías paso a paso para las tareas más comunes y el manual de cada sección." + botón "Ver el tour" (`tourStart`); buscador ("¿Qué quieres aprender? Ej. empeño, quincena, extracto…"); pestañas "Instructivos paso a paso" (`guias`) y "Manual por sección" (`modulos`). Guías: acordeón con ícono, "{n} pasos · {min} min", pasos numerados, tip con bombillo y "Ir a la sección". Módulos: isotipo de la sección (o ícono), `HELP.t`, `HELP.i`, pasos, tips y "Ir a la sección".
- Estado de UI: `AYQ` (búsqueda; se limpia al cambiar de vista, `ayView`), `FAQC` (categoría), `MANT` (pestaña). Búsqueda con debounce 250 ms que conserva el foco y la posición del cursor. Acciones `faqc`, `mant`.

→ Next: `content/ayuda/releases.json`, `faq.json`, `guides.json` (generados con el script) + páginas `app/(app)/ayuda/novedades|faq|manual`. "Visto" de novedades → `profiles.last_seen_version` (o localStorage). `CHANGELOG.md` debe seguir generándose desde `RELEASES`. Revisar textos que dependen de claude.ai (ver 6).

---

## 6. Riesgos, inconsistencias y decisiones pendientes
1. **Seguridad real**: hoy la cuenta solo bloquea la interfaz; los datos siguen legibles en `localStorage`. Con Supabase la protección pasa a RLS + sesión: dejar claro en la UI que cambió el modelo.
2. **Códigos de respaldo**: el FHELP "Código de respaldo" dice "Uno de los **10** códigos…", pero `genCodes()` genera **8**. Unificar (recomendado: corregir el texto a 8).
3. **FHELP "Últimos 2 dígitos de tu cédula"** se describe como "Pregunta de seguridad para recuperar tu cuenta", pero g_auth no tiene pregunta de seguridad (en Perfil, `c2_views.js`, ese campo sirve para calcular la fecha de renta DIAN y su `tip` lo explica bien; el FHELP queda opacado por el `tip`, pero aun así se concatena si el tip es corto). Corregir el texto.
4. **Código por correo** usa `Math.random` y Gmail vía MCP (solo claude.ai). En Next, usar el OTP de Supabase o el proveedor de correo del servidor.
5. **Método de recuperación "Confirmar con mi sesión de Claude"** y textos que mencionan claude.ai (alerta de Ajustes › Seguridad, FAQ "La lectura con foto no funciona" → "Funciona dentro de claude.ai", FAQ "¿Dónde se guardan mis datos?", FAQ de IA "Claude incluido", RELEASES 3.6 "La clave se guarda solo en tu navegador" contradice 3.9) deben revisarse al migrar. RELEASES es histórico: no reescribir versiones pasadas, solo FAQ/ayudas vigentes.
6. **Deshacer** con snapshot completo de `S` (toasts, `aporteDel`, borrados) no es viable con base de datos multiusuario: usar soft delete o reinserción.
7. **Valores de ciudad guardados** (`"Barbosa, Santander"`, `"La Unión, Nariño"`): mantener el formato de `v` o migrar los datos existentes.
8. **Lista de municipios incompleta** (243 de ~1.103): el pie "Usar "X" como ciudad" cubre los faltantes; decidir si se carga DIVIPOLA completa.
9. **Imprevistos** dependen de que `applyShows` se reevalúe tras la categoría automática (700 ms): en React basta con estado derivado de `cat`.
10. **Logos de suscripción** como data URL en el estado: en Supabase moverlos a Storage o limitar tamaño (hoy 72×72 PNG).
11. **OCR**: crea entidades automáticamente con `tipo:'Banco'` aunque sea otra clase; conservar el comportamiento pero considerar pedir confirmación.
12. **Orden de envolturas**: `applyLoanHist` (envuelto para empeño), `loanDetail` (prenda), `notifs` (empeños), `updatePreviews` (rango y pagos previos), `renderNav` (novedades), `toast` → `toastX`. En Next estas extensiones se vuelven composición explícita de componentes/funciones; no olvidar ninguna.
